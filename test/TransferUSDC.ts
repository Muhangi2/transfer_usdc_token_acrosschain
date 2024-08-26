import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer } from "ethers";

describe("TransferUSDCForkedTest", function () {
  let sender: Signer;
  let transferUSDCWithMockRouter: Contract;
  let transferUSDC: Contract;
  let crossChainReceiverWithMockRouter: Contract;
  let crossChainReceiver: Contract;
  let usdc_AvalancheFuji: Contract;
  let usdc_EthereumSepolia: Contract;

  const usdcAddressOnAvalancheFuji = "0x5425890298aed601595a70AB815c96711a31Bc65";
  const usdcAddressOnEthereumSepolia = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const compoundUsdcTokenAddressOnEthereumSepolia = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const fauceteerAddressOnEthereumSepolia = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C";
  const cometAddressOnEthereumSepolia = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";

  before(async function () {
    // Fork Avalanche Fuji and Ethereum Sepolia
    const AVALANCHE_FUJI_RPC_URL = process.env.AVALANCHE_FUJI_RPC_URL!;
    const ETHEREUM_SEPOLIA_RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL!;

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
    transferUSDCWithMockRouter = await TransferUSDC.deploy(/* mock router address */, /* link address */, usdcAddressOnAvalancheFuji);
    transferUSDC = await TransferUSDC.deploy(/* router address */, /* link address */, usdcAddressOnAvalancheFuji);

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

    crossChainReceiverWithMockRouter = await CrossChainReceiver.deploy(/* mock router address */, cometAddressOnEthereumSepolia, swapTestnetUSDC.address);
    crossChainReceiver = await CrossChainReceiver.deploy(/* router address */, cometAddressOnEthereumSepolia, swapTestnetUSDC.address);

    // Allowlist setup
    await crossChainReceiverWithMockRouter.allowlistSourceChain(/* chainSelector */, true);
    await crossChainReceiver.allowlistSourceChain(/* chainSelector */, true);
    await crossChainReceiverWithMockRouter.allowlistSender(transferUSDCWithMockRouter.address, true);
    await crossChainReceiver.allowlistSender(transferUSDC.address, true);
  });

  it("Measures gas usage for ccipReceive and adjusts gasLimit", async function () {
    const amountToSend = ethers.utils.parseUnits("1", 6); // 1 USDC
    const gasLimit = ethers.BigNumber.from(500_000);

    // Approve and Transfer USDC with Mock Router
    await usdc_AvalancheFuji.connect(sender).approve(transferUSDCWithMockRouter.address, amountToSend);
    const tx = await transferUSDCWithMockRouter.connect(sender).transferUsdc(
      /* chainSelector */,
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
      /* chainSelector */,
      crossChainReceiver.address,
      amountToSend,
      totalGasConsumedPlusTenPercent
    );

    const finalBalance = await usdc_AvalancheFuji.balanceOf(await sender.getAddress());
    console.log("Sender USDC Balance (Final):", finalBalance.toString());
  });
});
