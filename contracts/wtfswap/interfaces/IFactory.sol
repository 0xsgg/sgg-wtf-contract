// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IFactory {
    struct Parameters {
        address factory;
        address token0;
        address token1;
        int24 tickLower;
        int24 tickUpper;
        uint24 fee;
    }

    function parameters()
        external
        view
        returns (
            address factory,
            address token0,
            address token1,
            int24 tickLower,
            int24 tickUpper,
            uint24 fee
        );

    event PoolCreated(
        address token0,
        address token1,
        int24 tickLower,
        int24 tickUpper,
        uint24 fee,
        address pool,
        uint32 index
    );

    function getPool(
        address tokenA,
        address tokenB,
        uint32 index
    ) external view returns (address pool);

    function createPool(
        address token0,
        address token1,
        int24 tickLower,
        int24 tickUpper,
        uint24 fee
    ) external returns (address pool);
}
