// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../interfaces/IPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TestLP
 * @dev 用于测试流动性提供的合约，实现了基本的添加、移除和收集流动性的功能
 * 该合约实现了 IMintCallback 接口，用于处理添加流动性时的回调
 */
contract TestLP is IMintCallback {
    /**
     * @dev 对两个代币地址进行排序
     * @param tokenA 第一个代币地址
     * @param tokenB 第二个代币地址
     * @return 排序后的两个代币地址，确保 token0 < token1
     *
     * 在 Uniswap V3 中，代币对的顺序是确定的，较小地址的代币总是 token0
     */
    function sortToken(
        address tokenA,
        address tokenB
    ) private pure returns (address, address) {
        return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /**
     * @dev 向流动性池添加流动性
     * @param recipient 流动性代币的接收地址
     * @param amount 要添加的流动性数量
     * @param pool 目标流动性池地址
     * @param tokenA 第一个代币地址
     * @param tokenB 第二个代币地址
     * @return amount0 实际添加的 token0 数量
     * @return amount1 实际添加的 token1 数量
     *
     * 该函数会先对代币地址进行排序，然后调用池子的 mint 函数
     * 实际的代币转账会在 mintCallback 回调中完成
     */
    function mint(
        address recipient,
        uint128 amount,
        address pool,
        address tokenA,
        address tokenB
    ) external returns (uint256 amount0, uint256 amount1) {
        (address token0, address token1) = sortToken(tokenA, tokenB);

        (amount0, amount1) = IPool(pool).mint(
            recipient,
            amount,
            abi.encode(token0, token1)
        );
    }

    /**
     * @dev 从流动性池中移除流动性
     * @param amount 要移除的流动性数量
     * @param pool 目标流动性池地址
     * @return amount0 移除获得的 token0 数量
     * @return amount1 移除获得的 token1 数量
     *
     * 该函数会销毁指定数量的流动性代币，并获得相应的底层代币
     * 注意：移除的代币不会立即转给用户，需要通过 collect 函数收集
     */
    function burn(
        uint128 amount,
        address pool
    ) external returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = IPool(pool).burn(amount);
    }

    /**
     * @dev 收集应得的代币
     * @param recipient 代币接收地址
     * @param pool 目标流动性池地址
     * @return amount0 收集的 token0 数量
     * @return amount1 收集的 token1 数量
     *
     * 该函数会先查询当前合约在池子中的未领取代币数量
     * 然后调用池子的 collect 函数将代币转给指定接收者
     */
    function collect(
        address recipient,
        address pool
    ) external returns (uint256 amount0, uint256 amount1) {
        (, , , uint128 tokensOwed0, uint128 tokensOwed1) = IPool(pool)
            .getPosition(address(this));
        (amount0, amount1) = IPool(pool).collect(
            recipient,
            tokensOwed0,
            tokensOwed1
        );
    }

    /**
     * @dev mint 操作的回调函数，用于处理代币转账
     * @param amount0Owed 需要转入的 token0 数量
     * @param amount1Owed 需要转入的 token1 数量
     * @param data 编码的额外数据，包含 token0 和 token1 的地址
     *
     * 该函数在池子的 mint 操作中被调用
     * 用于将用户提供的代币转入池子中
     * data 参数包含了两个代币的地址信息，通过 abi.decode 解码
     */
    function mintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        // 解码代币地址
        (address token0, address token1) = abi.decode(data, (address, address));
        // 转移所需的 token0
        if (amount0Owed > 0) {
            IERC20(token0).transfer(msg.sender, amount0Owed);
        }
        // 转移所需的 token1
        if (amount1Owed > 0) {
            IERC20(token1).transfer(msg.sender, amount1Owed);
        }
    }
}
