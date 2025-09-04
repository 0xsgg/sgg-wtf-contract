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

    // 测试 mint、burn 和 collect 方法
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


        // create new LP 合约，继续 mint 3000 份流动性
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
        // 判断池子里面的 token0 是否等于 LP1 和 LP2 减少的 token0 之和
        const totalToken0InPool = initBalanceValue - await token0.read.balanceOf([testLP.address]) + 
        initBalanceValue - await token0.read.balanceOf([testLP2.address]);
        expect(await token0.read.balanceOf([pool.address])).to.equal(totalToken0InPool);


        // burn all Liquidity for testLP
        await testLP.write.burn([
            20040000n,
            pool.address,
        ])
        expect(await pool.read.liquidity()).to.equal(3000n);

        // 判断池子里面的 token0 是否等于 LP1 和 LP2 减少的 token0 之和，burn 只是把流动性返回给 LP，不会把 token 返回给 LP
        expect(await token0.read.balanceOf([pool.address])).to.equal(totalToken0InPool)

        // collect, all balance back to testLP
        await testLP.write.collect([testLP.address, pool.address]);

        // 由于取整问题，提取流动性之后获得 token 可能会少 1 wei，这里允许有 10 wei 的误差
        expect(Number(initBalanceValue - await token0.read.balanceOf([testLP.address]))).to.lessThan(10)
        expect(Number(initBalanceValue - await token1.read.balanceOf([testLP.address]))).to.lessThan(10)


    })
    
    // 测试 swap 方法
    it('swap', async function() {
        const { factory, token0, token1, tickLower, tickUpper, fee, sqrtPriceX96, pool, publicClient } = await loadFixture(deployFixture);

        const testLP = await hre.viem.deployContract('TestLP');
        
        const initBalanceValue = BigInt(100000000000n * 10n ** 18n); // 初始给 LP 铸币 100000000000 个 token0 和 token1
        
        // 给 testLP 合约铸币
        await token0.write.mint([testLP.address, initBalanceValue]);
        await token1.write.mint([testLP.address, initBalanceValue]);

        // mint 1000000000000000000000000000 份流动性， 多一些，确保交易可以完全成交
        const liquidityDelto = 1000000000000000000000000000n;
        await testLP.write.mint([
            testLP.address,
            liquidityDelto,
            pool.address,
            token0.address,
            token1.address,
        ])

        const lpToken0 = await token0.read.balanceOf([testLP.address]);
        expect(lpToken0).to.equal(99995000161384542080378486215n)  // 差值（转入池子的数量）：约 4999.84 * 10^18
        
        const lpToken1 = await token1.read.balanceOf([testLP.address]);
        expect(lpToken1).to.equal(1000000000n * 10n ** 18n)  // 几乎没有 token1 被转入池子

        
        // 部署 TestSwap 合约，完成 swap 合约交易
        const testSwap = await hre.viem.deployContract('TestSwap');
        const minPrice = 1000;
        const minSqrtPriceX96: bigint = BigInt(encodeSqrtRatioX96(minPrice, 1).toString());

        // 先给 testSwap 合约铸币一些 token0
        await token0.write.mint([testSwap.address, 300n * 10n ** 18n]);
        
        expect(await token0.read.balanceOf([testSwap.address])).to.equal(300n * 10n ** 18n);
        expect(await token1.read.balanceOf([testSwap.address])).to.equal(0n);

         // 进行 swap 交易，交换 100 个 token0，期望至少获得 100 * 10000 个 token1
        const result = await testSwap.simulate.testSwap([
            testSwap.address,
            100n * 10n ** 18n,
            minSqrtPriceX96,
            pool.address,
            token0.address,
            token1.address,
        ])

        expect(result.result[0]).to.equal(100000000000000000000n);  // 需要 100个 token0
        expect(result.result[1]).to.equal(-996990060009101709255958n) // 大概需要 100 * 10000 个 token1

       
        await testSwap.write.testSwap([
            testSwap.address,
            100n * 10n ** 18n,
            minSqrtPriceX96,
            pool.address,
            token0.address,
            token1.address, 
        ])

        const costToken0 = 300n * 10n ** 18n - await token0.read.balanceOf([testSwap.address]);
        const receiveToken1 = await token1.read.balanceOf([testSwap.address]);
        const newPrice = await pool.read.sqrtPriceX96() as bigint;
        const liquidity = await pool.read.liquidity();
        
        // 用户消耗了大约 100 个 token0
        expect(costToken0).to.equal(100n * 10n ** 18n);
        // 获得了大约 100 * 10000 个 token1
        expect(receiveToken1).to.equal(996990060009101709255958n);
        // 价格也下降了，计算价格差
        const initialPrice = BigInt(sqrtPriceX96.toString());
        expect(initialPrice - newPrice).to.equal(78989690499507264493336319n);
        // 流动性没有变化
        expect(liquidity).to.equal(liquidityDelto);
    
        // 删除流动性
        await testLP.write.burn([liquidityDelto, pool.address])
        // 断言当前 token 的数量
        expect(await token0.read.balanceOf([testLP.address])).to.equal(99995000161384542080378486215n)  // testLP 剩余的 token0 数量
        // 删除流动性后，断言池子的流动性为 0n
        expect(await pool.read.liquidity()).to.equal(0n);

        // 提取 token 代币
        await testLP.write.collect([testLP.address, pool.address]);
        // 判断 token 是否返回给 testLP，并且大于原来的数量，因为收到了手续费，并且有交易换入了 token0
        // 初始的 token0 是 const initBalanceValue = 100000000000n * 10n ** 18n;
        expect(await token0.read.balanceOf([testLP.address])).to.equal(100000000099999999999999999998n)  // testLP 剩余的 token0 数量

    }) 

})