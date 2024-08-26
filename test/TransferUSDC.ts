import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer } from "ethers";

describe("TransferUSDCForkedTest", function () {
    let sender: Signer;
    let transferUSDCWithMockRouter: any;
    let transferUSDC: any;
    let crossChainReceiverWithMockRouter: any;
    let crossChainReceiver: any;
    let usdc_AvalancheFuji: any;
    let usdc_EthereumSepolia: any;

    const usdcAddressOnAvalancheFuji = process.env.usdcAddressOnAvalancheFuji;
    const usdcAddressOnEthereumSepolia = process.env.usdcAddressOnEthereumSepolia;
    const compoundUsdcTokenAddressOnEthereumSepolia = process.env.compoundUsdcTokenAddressOnEthereumSepolia;
    const fauceteerAddressOnEthereumSepolia = process.env.fauceteerAddressOnEthereumSepolia;
    const cometAddressOnEthereumSepolia = process.env.cometAddressOnEthereumSepolia;

    before(async function () {
        // Fork Avalanche Fuji and Ethereum Sepolia
        const AVALANCHE_FUJI_RPC_URL = process.env.AVALANCHE_FUJI_RPC_URL;
        const ETHEREUM_SEPOLIA_RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL;

        const avalancheFujiFork = await ethers.provider.send("hardhat_reset", [
            {
                forking: {
                    jsonRpcUrl: AVALANCHE_FUJI_RPC_URL,
                },
            },
        ]);

        const ethereumSepoliaFork = await ethers.provider.send("hardhat_reset", [
            {
                forking: {
                    jsonRpcUrl: ETHEREUM_SEPOLIA_RPC_URL,
                },
            },
        ]);

        [sender] = await ethers.getSigners();

        // Deploy contracts on Avalanche Fuji fork
        const TransferUSDC = await ethers.getContractFactory("TransferUSDC");
        transferUSDCWithMockRouter = await TransferUSDC.deploy(usdcAddressOnAvalancheFuji);
        transferUSDC = await TransferUSDC.deploy(usdcAddressOnAvalancheFuji);

        usdc_AvalancheFuji = await ethers.getContractAt("IERC20", usdcAddressOnAvalancheFuji);

        // Deploy contracts on Ethereum Sepolia fork
        const SwapTestnetUSDC = await ethers.getContractFactory("SwapTestnetUSDC");
        const CrossChainReceiver = await ethers.getContractFactory("CrossChainReceiver");

        usdc_EthereumSepolia = await ethers.getContractAt("IERC20", usdcAddressOnEthereumSepolia);

        const swapTestnetUSDC = await SwapTestnetUSDC.deploy(
            usdcAddressOnEthereumSepolia,
            compoundUsdcTokenAddressOnEthereumSepolia,
            fauceteerAddressOnEthereumSepolia
        );

        crossChainReceiverWithMockRouter = await CrossChainReceiver.deploy(cometAddressOnEthereumSepolia, swapTestnetUSDC.target);
        crossChainReceiver = await CrossChainReceiver.deploy(cometAddressOnEthereumSepolia, swapTestnetUSDC.target);

        // Allowlist setup
        await crossChainReceiverWithMockRouter.allowlistSourceChain(true);
        await crossChainReceiver.allowlistSourceChain(true);
        await crossChainReceiverWithMockRouter.allowlistSender(transferUSDCWithMockRouter.address, true);
        await crossChainReceiver.allowlistSender(transferUSDC.address, true);
    });

    it("Measures gas usage for ccipReceive and adjusts gasLimit", async function () {
        const amountToSend = ethers.parseUnits("1", 6); // 1 USDC
        const gasLimit = 500_000;

        // Approve and Transfer USDC with Mock Router
        await usdc_AvalancheFuji.connect(sender).approve(transferUSDCWithMockRouter.address, amountToSend);
        const tx = await transferUSDCWithMockRouter.connect(sender).transferUsdc(

            crossChainReceiverWithMockRouter.address,
            amountToSend,
            gasLimit
        );
        const receipt = await tx.wait();

        // Calculate and log gas used
        const gasUsed = receipt.gasUsed.toNumber();
        const totalGasConsumedPlusTenPercent = Math.floor(gasUsed * 1.1);

        console.log("Total Gas used (plus 10 percent):", totalGasConsumedPlusTenPercent);

        // Use the adjusted gas limit in the second transfer
        await usdc_AvalancheFuji.connect(sender).approve(transferUSDC.address, amountToSend);
        await transferUSDC.connect(sender).transferUsdc(
            crossChainReceiver.address,
            amountToSend,
            totalGasConsumedPlusTenPercent
        );

        const finalBalance = await usdc_AvalancheFuji.balanceOf(await sender.getAddress());
        console.log("Sender USDC Balance (Final):", finalBalance.toString());
    });
});
