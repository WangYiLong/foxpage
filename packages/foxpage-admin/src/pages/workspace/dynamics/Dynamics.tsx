import React, { useContext, useEffect } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

import { Pagination, Spin, Steps, Tag } from 'antd';
import styled from 'styled-components';
import { RootState } from 'typesafe-actions';

import * as ACTIONS from '@/actions/workspace/dynamics';
import { dynamicType } from '@/constants/workspace';
import { suffixTagColor } from '@/pages/common/constant/FileType';
import GlobalContext from '@/pages/GlobalContext';
import { Dynamic } from '@/types/workspace';
import periodFormat from '@/utils/period-format';

const { Step: AntdStep } = Steps;

const Container = styled.div`
  height: 100%;
  min-height: 680px;
`;

const Step = styled(AntdStep)`
  .ant-steps-item-content {
    .ant-steps-item-title {
      width: 100%;
    }
    .ant-steps-item-subtitle {
      margin-left: 0;
      width: 100%;
      display: flex;
      justify-content: space-between;
    }
  }
`;
const mapStateToProps = (store: RootState) => ({
  loading: store.workspace.dynamics.loading,
  pageInfo: store.workspace.dynamics.pageInfo,
  dynamics: store.workspace.dynamics.dynamics,
});

const mapDispatchToProps = {
  searchDynamics: ACTIONS.searchDynamics,
  clearAll: ACTIONS.clearAll,
};

type DynamicProps = ReturnType<typeof mapStateToProps> & typeof mapDispatchToProps;

const Dynamics: React.FC<DynamicProps> = (props) => {
  const { loading, pageInfo, dynamics, searchDynamics, clearAll } = props;

  const { locale } = useContext(GlobalContext);
  const { global } = locale.business;

  useEffect(() => {
    searchDynamics({ page: pageInfo.page, size: pageInfo.size, search: '' });
    return () => {
      clearAll();
    };
  }, []);

  return (
    <Spin spinning={loading}>
      <Container>
        <Steps progressDot current={dynamics.length} direction="vertical">
          {dynamics.map((dynamic: Dynamic) => {
            const { realMethod, name, user, applicationName, originUrl } = dynamic.content;
            return (
              <Step
                key={dynamic.id}
                title={periodFormat(dynamic.createTime, 'unknown')}
                subTitle={
                  <>
                    {name && (
                      <>
                        {realMethod === dynamicType.delete || !originUrl ? (
                          <div>{name}</div>
                        ) : (
                          <Link to={originUrl.replace('/#', '')}>{name}</Link>
                        )}
                        <div>
                          {global.user}：{user}
                        </div>
                      </>
                    )}
                  </>
                }
                description={
                  <>
                    {applicationName && (
                      <div>
                        {global.application}：{applicationName}
                      </div>
                    )}

                    <div>
                      {global.type}：
                      <Tag color={suffixTagColor[realMethod]}>{global[dynamicType[realMethod]]}</Tag>
                    </div>
                  </>
                }
              />
            );
          })}
        </Steps>
        <Pagination
          style={{ textAlign: 'center' }}
          current={pageInfo.page}
          total={pageInfo.total}
          pageSize={pageInfo.size}
          hideOnSinglePage
          onChange={(page, pageSize) => {
            searchDynamics({ page, size: pageSize, search: '' });
          }}
        />
      </Container>
    </Spin>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Dynamics);
