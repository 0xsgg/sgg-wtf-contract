import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { assert, expect } from 'chai';
import hre from "hardhat";
import { TickMath, encodeSqrtRatioX96 } from '@uniswap/v3-sdk'

describe("PositionManager", function () {
    async function deployFixture() {
        // 初始化一个池子，价格上限 40000， 价格下限 1， 初始价格 10000， 费率 0.3%
        const poolManager = await hre.viem.deployContract('PoolManager');
        const tokenA = await hre.viem.deployContract('TestToken')
        const tokenB = await hre.viem.deployContract('TestToken')
        const token0 = tokenA.address < tokenB.address ? tokenA : tokenB;
        const token1 = tokenA.address < tokenB.address ? tokenB : tokenA;
        const tickLower = TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 1));
        const tickUpper = TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(40000, 1));
        const fee = 3000;

        const [owner] = await hre.viem.getWalletClients();
        const [sender] = await owner.getAddresses()

        await poolManager.write.createAndInitializePoolIfNecessary([{
            token0: token0.address,
            token1: token1.address,
            fee,
            tickLower,
            tickUpper,
            sqrtPriceX96: BigInt(encodeSqrtRatioX96(200, 1).toString()),
        }])
        
        const createEvents = await poolManager.getEvents.PoolCreated();
        const poolAddress: `0x${string}` = createEvents[0].args.pool || '0x';
        const pool = await hre.viem.getContractAt('Pool' as string, poolAddress)

        const manager = await hre.viem.deployContract('PositionManager', [poolManager.address])

        const publicClient = await hre.viem.getPublicClient();
        return { manager, poolManager, pool, token0, token1, fee, tickLower, tickUpper, owner, sender, publicClient };   

    }


    it('mint & burn & collect', async function() {
        const { manager, poolManager, pool, token0, token1, fee, tickLower, tickUpper, owner, sender, publicClient } = await loadFixture(deployFixture);

        // 先给 sender 打钱
        const initBalanceValue = 1000n * 10n ** 18n
        await token0.write.mint([sender, initBalanceValue]);
        await token1.write.mint([sender, initBalanceValue]);

        // sender 授权给 PositionManager
        await token0.write.approve([manager.address, initBalanceValue]);
        await token1.write.approve([manager.address, initBalanceValue]);

        // mint
        await manager.write.mint([
            {
                token0: token0.address,
                token1: token1.address,
                index: 0,
                amount0Desired: 1000n * 10n ** 18n,
                amount1Desired: 1000n * 10n ** 18n,
                recipient: sender,
                deadline: BigInt(Date.now() + 3000)

            }
        ])

        // mint成功， 检查余额
        expect(await token0.read.balanceOf([sender])).to.equal(995000012279932782687n)
        expect(await token0.read.balanceOf([pool.address])).to.equal(4999987720067217313n)

        // sender 收到了 NFT
        expect(await manager.read.ownerOf([1n])).to.equal(sender)

        // burn
        await manager.write.burn([1n])

        // collect
        await manager.write.collect([1n, sender])

        // 检查余额，因为取整问题，可能会有一点损耗
        expect(await token0.read.balanceOf([sender])).to.equal(999999999999999999999n)
    })


    it('collect with fee', async function() {
        const {token0, token1, pool, sender, manager } = await loadFixture(deployFixture)
        
        // 给 sender 打钱
        const initBalanceValue = 100000000000n * 10n ** 18n
        await token0.write.mint([sender, initBalanceValue])
        await token1.write.mint([sender, initBalanceValue])

        // sender 授权 PositionManager
        await token0.write.approve([manager.address, initBalanceValue])
        await token1.write.approve([manager.address, initBalanceValue])

        // mint 多一些流动性， 确保交易能完全完成
        await manager.write.mint([{
            token0: token0.address,
            token1: token1.address,
            index: 0,
            recipient: sender,
            amount0Desired: initBalanceValue - 1000n * 10n ** 18n,
            amount1Desired: initBalanceValue - 1000n * 10n ** 18n,
            deadline: BigInt(Date.now() + 3000)
        }])

        // mint anthor 1000
        await manager.write.mint([{
            token0: token0.address,
            token1: token1.address,
            index: 0,
            recipient: sender,
            amount0Desired: 1000n * 10n ** 18n,
            amount1Desired: 1000n * 10n ** 18n,
            deadline: BigInt(Date.now() + 3000)
        }])

        // 通过 testSwap 合约 进行交易
        const testSwap = await hre.viem.deployContract('TestSwap')
        // const minPrice = 1000;
        // 当前价格 200:1, 设置最低价格为 180:1
        const minPrice = 180;
        const minSqrtPriceX96: bigint = BigInt(encodeSqrtRatioX96(minPrice, 1).toString())

        // 给 testSwap 合约 打入 token0 用于交易
        await token0.write.mint([testSwap.address, 300n * 10n ** 18n])

        await testSwap.write.testSwap([
            testSwap.address,
            100n * 10n ** 18n,
            minSqrtPriceX96,
            pool.address,
            token0.address,
            token1.address
        ])

        // 删除流动性， 调用 burn
        await manager.write.burn([1n])
        await manager.write.burn([2n])
        
        // 查看当前 token 余额
        expect(await token0.read.balanceOf([sender])).to.equal(99500001227993278268746590572n)

        // 提取 token
        await manager.write.collect([1n, sender])
        // 判断 token 是否返回给 testLP，并且大于原来的数量，因为收到了手续费，并且有交易换入了 token0
        // 初始的 token0 是 const initBalanceValue = 100000000000n * 10n ** 18n;
        expect(await token0.read.balanceOf([sender])).to.equal(100000000095000011279932782685n)
        

        await manager.write.collect([2n, sender])
        expect(await token0.read.balanceOf([sender])).to.equal(100000000099999999999999999996n)
    })
})