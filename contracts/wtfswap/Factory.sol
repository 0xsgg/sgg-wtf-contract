// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "./interfaces/IFactory.sol";
import "./Pool.sol";

contract Factory is IFactory {
    // 存放所有创建的池子
    mapping(address => mapping(address => address[])) public pools;

    Parameters public override parameters;

    function sortToken(
        address tokenA,
        address tokenB
    ) private pure returns (address, address) {
        return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint32 index
    ) external view override returns (address) {
        // validate token's individuality
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");

        // Declare token0 and token1
        address token0;
        address token1;

        // sort token, avoid the mistake of the order
        (token0, token1) = sortToken(tokenA, tokenB);

        // get pool
        return pools[token0][token1][index];
    }

    function createPool(
        address tokenA,
        address tokenB,
        int24 tickLower,
        int24 tickUpper,
        uint24 fee
    ) external override returns (address pool) {
        // validate token's individuality
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");

        // Declare token0 and token1
        address token0;
        address token1;

        // sort token, avoid the mistake of the order
        (token0, token1) = sortToken(tokenA, tokenB);

        // get current pools
        address[] memory existingPools = pools[token0][token1];
        // check if the pool already exists
        for (uint256 i = 0; i < existingPools.length; i++) {
            Pool existingPool = Pool(existingPools[i]);
            if (
                existingPool.tickLower() == tickLower &&
                existingPool.tickUpper() == tickUpper &&
                existingPool.fee() == fee
            ) {
                return address(existingPool);
            }
        }

        // save pool info
        parameters = Parameters(
            address(this),
            tokenA,
            tokenB,
            tickLower,
            tickUpper,
            fee
        );

        // generate create2 salt
        bytes32 salt = keccak256(
            abi.encode(token0, token1, tickLower, tickUpper, fee)
        );

        // create pool
        pool = address(new Pool{ salt: salt }());

        // save created pool
        pools[token0][token1].push(pool);

        // delete pool info
        delete parameters;

        emit PoolCreated(
            token0,
            token1,
            tickLower,
            tickUpper,
            fee,
            pool,
            uint32(existingPools.length)
        );
    }
}
