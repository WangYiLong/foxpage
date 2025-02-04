import _ from 'lodash';

import { Application, AppResource, Folder, Organization } from '@foxpage/foxpage-server-types';

import { LOG, PRE, TYPE } from '../../config/constant';
import * as Model from '../models';
import { AppInfo, AppOrgInfo, AppSearch, AppWithFolder } from '../types/app-types';
import { FolderFileContent } from '../types/content-types';
import { FoxCtx, PageList } from '../types/index-types';
import { generationId } from '../utils/tools';

import { BaseService } from './base-service';
import * as Service from './index';

export class ApplicationService extends BaseService<Application> {
  private static _instance: ApplicationService;

  constructor() {
    super(Model.application);
  }

  /**
   * Single instance
   * @returns ApplicationService
   */
  public static getInstance(): ApplicationService {
    this._instance || (this._instance = new ApplicationService());
    return this._instance;
  }
  /**
   * New content details, only query statements required by the transaction are generated,
   * and details of the created content are returned
   * @param  {Partial<Content>} params
   * @returns Content
   */
  create(params: Partial<Application>, options: { ctx: FoxCtx }): Application {
    const appDetail: Application = {
      id: params.id || generationId(PRE.APP),
      intro: params.intro || '',
      slug: _.trim(params.slug) || '',
      locales: params.locales || [],
      deleted: false,
      organizationId: params.organizationId || '',
      name: _.trim(params.name) || '',
      creator: params.creator || options.ctx.userInfo.id,
      resources: params.resources || [],
    };

    options.ctx.transactions.push(Model.application.addDetailQuery(appDetail));
    options.ctx.operations.push({
      action: LOG.CREATE,
      category: { type: LOG.CATEGORY_ORGANIZATION, id: params.organizationId },
      content: { id: appDetail.id, dataType: TYPE.APPLICATION, after: appDetail },
    });

    return appDetail;
  }

  /**
   * Get application details including default folders
   * @param  {string} applicationId
   * @returns {AppWithFolder}
   */
  async getAppDetailWithFolder(applicationId: string): Promise<AppWithFolder> {
    // Get application details and folders under the root node
    const [appDetail, folderList] = await Promise.all([
      this.getDetailById(applicationId),
      Service.folder.list.getAppFolderList(applicationId, ''),
    ]);

    return _.merge(appDetail, { folders: folderList || [] });
  }

  /**
   * Get the basic paging list information of the specified application,
   * including the basic organization information corresponding to the application
   * @param  {AppSearch} params
   * @returns Promise
   */
  async getPageListWithOrgInfo(params: AppSearch): Promise<PageList<AppOrgInfo>> {
    let appOrgList: AppOrgInfo[] = [];
    const [appList, total] = await Promise.all([
      Model.application.getAppList(params),
      Model.application.getTotal(params),
    ]);

    // Get organization Ids
    let orgObject: Record<string, Organization> = {};
    const organizationIds: string[] = _.uniq(_.map(appList, 'organizationId'));
    if (organizationIds.length > 0) {
      const orgList = await Service.org.find({ id: { $in: organizationIds } }, '-_id id name');
      orgObject = _.keyBy(orgList, 'id');
    }

    appList.forEach((app) => {
      appOrgList.push(
        Object.assign(_.pick(app, ['id', 'name']), { organization: orgObject[app.organizationId] || {} }),
      );
    });

    return {
      pageInfo: { page: <number>params.page, size: <number>params.size, total: total },
      data: appOrgList,
    };
  }

  /**
   * Get a list of apps containing paging information
   * @param  {AppSearch} params
   * @returns {AppInfo} Promise
   */
  async getPageList(params: AppSearch): Promise<PageList<AppInfo>> {
    const [appList, total] = await Promise.all([
      Model.application.getAppList(params),
      Model.application.getTotal(params),
    ]);

    // Obtain user name data based on app lists data
    let appUserList: AppInfo[] = [];
    if (appList.length > 0) {
      const userBase = await Service.user.getDetailByIds(_.map(appList, 'creator'));
      const userBaseObject = _.keyBy(
        _.map(userBase, (user) => _.pick(user, ['id', 'account'])),
        'id',
      );

      appList.map((app) => {
        const appBase = Object.assign(_.omit(app, 'creator'), {
          creator: userBaseObject[app.creator],
        }) as AppInfo;
        appUserList.push(appBase);
      });
    }

    return {
      pageInfo: { page: <number>params.page, size: <number>params.size, total: total },
      data: appUserList,
    };
  }

  /**
   * Get the details of the resource type specified by the application
   * @param  {any} params: {applicationId, resourceId}
   * @returns Promise
   */
  async getAppResourceDetail(params: any): Promise<Partial<AppResource>> {
    const appDetail = await this.getDetailById(params.applicationId);
    return appDetail?.resources?.find((resource) => resource.id === params.id) || {};
  }

  /**
   * Check the resource field of the app update
   * 1, resource cannot be deleted
   * 2, the resource name cannot be repeated
   * 3, the type of resource cannot be modified
   * @param  {AppResource[]} appResource
   * @param  {AppResource[]} resources
   * @returns string
   */
  checkAppResourceUpdate(
    appResource: AppResource[],
    resources: AppResource[],
  ): { code: number; data: string[] } {
    const resourceIdName: Record<string, string> = {};
    const appResourceObject: Record<string, AppResource> = {};
    const appResourceName: Record<string, string> = {};

    appResource.forEach((resource) => {
      resourceIdName[resource.id] = resource.name;
      appResourceObject[resource.id] = resource;
      appResourceName[resource.name] = resource.id;
    });

    let duplicateName: string[] = [];
    let invalidType: string[] = [];
    let invalidResource: string[] = [];

    resources.forEach((resource) => {
      if (resource.id) {
        _.unset(resourceIdName, resource.id);
        if (!appResourceObject[resource.id]) {
          invalidResource.push(resource.name);
        } else if (resource.type !== appResourceObject[resource.id].type) {
          // change type is disabled
          invalidType.push(resource.name);
        }
      } else if (appResourceName[resource.name]) {
        duplicateName.push(resource.name);
      }
    });

    if (invalidResource.length > 0) {
      return { code: 4, data: invalidResource };
    }

    if (!_.isEmpty(resourceIdName)) {
      return { code: 1, data: _.toArray(resourceIdName) };
    }

    if (duplicateName.length > 0) {
      return { code: 2, data: duplicateName };
    }

    if (invalidType.length > 0) {
      return { code: 3, data: invalidType };
    }

    return { code: 0, data: [] };
  }

  /**
   * Get application resource list from special content all parent array
   * @param  {Record<string} contentAllParents
   * @param  {} FolderFileContent[]>
   * @returns Promise
   */
  async getAppResourceFromContent(
    contentAllParents: Record<string, FolderFileContent[]>,
  ): Promise<AppResource[]> {
    let contentAppIds: string[] = [];
    for (const contentId in contentAllParents) {
      contentAppIds.push((contentAllParents[contentId][0] as Folder)?.applicationId || '');
    }

    const appList = await this.getDetailByIds(_.uniq(contentAppIds));
    return _.flatten(_.map(appList, 'resources')) || [];
  }
}
