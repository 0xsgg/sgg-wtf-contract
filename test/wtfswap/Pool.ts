import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { assert, expect } from "chai";
import hre from  'hardhat';
import { TickMath, encodeSqrtRatioX96} from '@uniswap/v3-sdk';

describe("Pool", function () {
    // 部署合约的 fixture
    async function deployFixture() {
        const factory = await hre.viem.deployContract('Factory');
        const tokenA = await hre.viem.deployContract('TestToken');
        const tokenB = await hre.viem.deployContract('TestToken');
        const token0 = tokenA.address < tokenB.address ? tokenA : tokenB;
        const token1 = tokenA.address < tokenB.address ? tokenB : tokenA;
        const tickLower = TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 1));
        const tickUpper = TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(40000, 1));
         // 以 1,000,000 为基底的手续费费率，Uniswap v3 前端界面支持四种手续费费率（0.01%，0.05%、0.30%、1.00%），对于一般的交易对推荐 0.30%，fee 取值即 3000；
        const fee = 3000;
        await factory.write.createPool([ 
            token0.address,
            token1.address,
            tickLower,
            tickUpper,
            fee
        ])

        const createEvents = await factory.getEvents.PoolCreated();
        assert(createEvents.length === 1, "PoolCreated event not emitted");
        const poolAddress: `0x${string}` = createEvents[0].args.pool || '0x';
        const pool = await hre.viem.getContractAt('Pool' as string, poolAddress);

        // 计算一个初始化的价格，按照 1 个 token0 换 10000 个 token1 来算，其实就是 10000
        const sqrtPriceX96 = encodeSqrtRatioX96(10000, 1);
        await pool.write.initialize([sqrtPriceX96]);

        const publicClient = await hre.viem.getPublicClient();

        return { 
            factory, 
            token0,
            token1,
            tickLower,
            tickUpper,
            fee,
            sqrtPriceX96,
            pool,
            publicClient
        };   
    }

    // 测试池子的基本信息
    it('pool info', async function() {
        const { factory, token0, token1, tickLower, tickUpper, fee, sqrtPriceX96, pool, publicClient } = await loadFixture(deployFixture);

        // 检查池子的基本信息
        expect(((await pool.read.token0()) as string).toLocaleLowerCase()).to.equal(token0.address.toLocaleLowerCase());
        expect(((await pool.read.token1()) as string).toLocaleLowerCase()).to.equal(token1.address.toLocaleLowerCase());
        expect(await pool.read.fee()).to.equal(fee);
        expect(await pool.read.tickLower()).to.equal(tickLower);
        expect(await pool.read.tickUpper()).to.equal(tickUpper);
        expect(await pool.read.sqrtPriceX96()).to.equal(BigInt(sqrtPriceX96.toString()));
        expect(await pool.read.tick()).to.equal(TickMath.getTickAtSqrtRatio(sqrtPriceX96));
    })


    it('mint & burn & collect', async function() {
        const { factory, token0, token1, tickLower, tickUpper, fee, sqrtPriceX96, pool, publicClient } = await loadFixture(deployFixture);
        const testLP = await hre.viem.deployContract('TestLP');
        
        const initBalanceValue = BigInt(1000n * 10n ** 18n); // 初始给 LP 铸币 1000 个 token0 和 token1
        
        // 给 testLP 合约铸币
        await token0.write.mint([testLP.address, initBalanceValue]);
        await token1.write.mint([testLP.address, initBalanceValue]);


        // mint 20000000 份流动性
        await testLP.write.mint([
            testLP.address,
            20000000n,
            pool.address,
            token0.address,
            token1.address,
        ])

        expect(await token0.read.balanceOf([pool.address])).to.equal(initBalanceValue - await token0.read.balanceOf([testLP.address]));
        expect(await token1.read.balanceOf([pool.address])).to.equal(initBalanceValue - await token1.read.balanceOf([testLP.address]));

       
        const position = await pool.read.positions([testLP.address]);

        expect(position).to.deep.equal([20000000n,0n, 0n, 0n, 0n]);
        expect(await pool.read.liquidity()).to.equal(20000000n);

        // 继续 mint 50000 份流动性
        await testLP.write.mint([
            testLP.address,
            50000n,
            pool.address,
            token0.address,
            token1.address,
        ])

        expect(await pool.read.liquidity()).to.equal(20050000n);
        expect((await token0.read.balanceOf([pool.address]))).to.equal(initBalanceValue - (await token0.read.balanceOf([testLP.address])));
        expect((await token1.read.balanceOf([pool.address]))).to.equal(initBalanceValue - (await token1.read.balanceOf([testLP.address])));


        // burn 10000 份流动性
        await testLP.write.burn([
            10000n,
            pool.address,
        ])

        expect(await pool.read.liquidity()).to.equal(20040000n);

        const testLP2 = await hre.viem.deployContract('TestLP');
        await token0.write.mint([testLP2.address, initBalanceValue]);
        await token1.write.mint([testLP2.address, initBalanceValue]);

        await testLP2.write.mint([
            testLP2.address,
            3000n,
            pool.address,
            token0.address,
            token1.address,
        ])

        const totalToken0InPool = initBalanceValue - await token0.read.balanceOf([testLP.address]) + 
        initBalanceValue - await token0.read.balanceOf([testLP2.address]);

        expect(token0.read.balanceOf([pool.address])).to.equal(totalToken0InPool);


    })
    

})