import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const WtfswapModule = buildModule('Wtfswap', (m) => {
    // 部署 PoolManager 合约
    const poolManager = m.contract('PoolManager', [], {
        from: m.getAccount(0)  // 使用第一个账户作为部署者
    });

    // 部署 SwapRouter 合约，需要 poolManager 作为参数
    const swapRouter = m.contract('SwapRouter', [], {
        from: m.getAccount(0)
    });

    // 部署 PositionManager 合约，需要 poolManager 作为参数
    const positionManager = m.contract('PositionManager', [], {
        from: m.getAccount(0)
    });

    // 返回所有部署的合约
    return {
        poolManager,
        positionManager,
        swapRouter,
    };
});

export default WtfswapModule;