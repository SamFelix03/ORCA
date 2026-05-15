Now I have everything from the official Hyperlane docs. Here is the exact, Windows-specific, step-by-step guide — nothing mocked, nothing skipped.

Exact Steps: Hyperlane on Kite Testnet (Windows PC)
What You're Building
You will self-deploy the full Hyperlane stack onto Kite Testnet (Chain ID: 2368) and connect it to Sepolia (as your second test chain, which already has Hyperlane). Then you'll deploy a USDC Warp Route between them — the exact equivalent of ORCA's ORCAOApp + RemoteAdapter.

PHASE 0 — Install Prerequisites
Open PowerShell as Administrator for all steps.
Step 0.1 — Install Node.js 18+
Node 18 or newer is required for the Hyperlane CLI. hyperlane
Download from: https://nodejs.org/en/download
Choose the Windows Installer (.msi), LTS version. Install it, then verify:
powershellnode --version   # should show v18.x.x or higher
npm --version
Step 0.2 — Install Docker Desktop
You need Docker to run the validator and relayer agents.
Download from: https://www.docker.com/products/docker-desktop/
Install it, start Docker Desktop, and verify:
powershelldocker --version
docker ps

⚠️ On Windows, Docker Desktop requires WSL 2 (Windows Subsystem for Linux). The installer will prompt you automatically. Let it install WSL 2.

Step 0.3 — Install Git
Download from: https://git-scm.com/download/win
Install with defaults, then verify:
powershellgit --version

PHASE 1 — Install Hyperlane CLI
To install the CLI globally, use the npm install -g command. This will make the hyperlane command available anywhere in your terminal. hyperlane
powershellnpm install -g @hyperlane-xyz/cli
Verify:
powershellhyperlane --version

PHASE 2 — Prepare Your Wallets & Fund Them
You need two funded wallets:

Deployer wallet — deploys Hyperlane contracts on Kite testnet
Validator wallet — signs checkpoints
Relayer wallet — pays gas to deliver messages

For a hackathon, one wallet can serve all three roles. Export your private key from MetaMask.
Fund your deployer wallet on Kite Testnet:

Go to https://faucet.gokite.ai
Connect your wallet and claim testnet KITE tokens

Fund your deployer wallet on Sepolia (the remote chain):

Use any Sepolia faucet (e.g., https://sepoliafaucet.com)


PHASE 3 — Register Kite Testnet Chain Metadata
Run hyperlane registry init and follow the prompts to set up your chain metadata. Under $HOME/.hyperlane/chains you will find a new folder named with your custom chain's name, and a file named metadata.yaml within that folder. Hyperlane
powershellhyperlane registry init
When prompted, enter these exact values from your ORCA document:
Chain name:     kiteozone
Chain ID:       2368
RPC URL:        https://rpc-testnet.gokite.ai
Native token:   KITE
Decimals:       18
Block explorer: https://testnet.kitescan.ai
Is testnet:     yes
This creates: C:\Users\<YourUser>\.hyperlane\chains\kiteozone\metadata.yaml
Verify it was created:
powershellcat "$env:USERPROFILE\.hyperlane\chains\kiteozone\metadata.yaml"
It should look like:
yamlname: kiteozone
chainId: 2368
domainId: 2368
protocol: ethereum
rpcUrls:
  - http: https://rpc-testnet.gokite.ai
nativeToken:
  symbol: KITE
  name: Kite
  decimals: 18
isTestnet: true
blockExplorers:
  - name: KiteScan Testnet
    url: https://testnet.kitescan.ai

PHASE 4 — Deploy Hyperlane Core Contracts on Kite Testnet
Step 4.1 — Set your private key
powershell$env:HYP_KEY = "0xYOUR_PRIVATE_KEY_HERE"
Step 4.2 — Initialize core config
From the same terminal instance, run hyperlane core init. Hyperlane
powershellhyperlane core init
When prompted, select Multisig ISM (not Trusted Relayer — that's for testing only). Enter your validator address (your wallet address).
Step 4.3 — Deploy core contracts
To deploy contracts, run hyperlane core deploy. Use the arrows and enter to select your custom chain from the bottom of the mainnet list. It will take a few minutes for all contracts to deploy. Hyperlane
powershellhyperlane core deploy

Use arrow keys to scroll to kiteozone at the bottom of the list
Press Enter to select it
Confirm deployment

This deploys: Mailbox, ISM, ValidatorAnnounce, ProxyAdmin, and InterchainGasPaymaster contracts on Kite testnet.
After deployment, you'll see contract addresses printed. Save them. They are also written to:
C:\Users\<YourUser>\.hyperlane\chains\kiteozone\addresses.yaml

PHASE 5 — Run Validator (Docker)
The validator watches Kite testnet and signs message checkpoints so the relayer can prove messages are valid.
Step 5.1 — Generate agent config
Generate an agent config file using the Hyperlane CLI: hyperlane
powershellhyperlane registry agent-config --chains kiteozone,sepolia
This creates .\configs\agent-config.json.
Step 5.2 — Set environment variable
powershell$env:CONFIG_FILES = "$pwd\configs\agent-config.json"
Step 5.3 — Create directories
powershellmkdir hyperlane_db_validator_kiteozone
mkdir tmp\hyperlane-validator-signatures-kiteozone
Step 5.4 — Pull Docker image
Pull the latest docker image: hyperlane
powershelldocker pull --platform linux/amd64 ghcr.io/hyperlane-xyz/hyperlane-agent:agents-v2.2.0
Step 5.5 — Update agent config for Windows Docker
Unless you are running Docker on Linux, you will need to update the agent configuration for your network. Replace all instances of "localhost" or "127.0.0.1" with host.docker.internal. hyperlane
Open .\configs\agent-config.json in any text editor and replace any localhost or 127.0.0.1 with host.docker.internal.
Step 5.6 — Run the validator
powershelldocker run `
  -it `
  -e CONFIG_FILES=/config/agent-config.json `
  --mount type=bind,source="$env:CONFIG_FILES",target=/config/agent-config.json,readonly `
  --mount type=bind,source="$pwd\hyperlane_db_validator_kiteozone",target=/hyperlane_db `
  --mount type=bind,source="$pwd\tmp\hyperlane-validator-signatures-kiteozone",target=/tmp/validator-signatures `
  ghcr.io/hyperlane-xyz/hyperlane-agent:agents-v2.2.0 `
  ./validator `
  --db /hyperlane_db `
  --originChainName kiteozone `
  --checkpointSyncer.type localStorage `
  --checkpointSyncer.path /tmp/validator-signatures `
  --validator.key 0xYOUR_PRIVATE_KEY_HERE
Leave this terminal open — the validator must keep running.

PHASE 6 — Run Relayer (Docker, new terminal)
The relayer picks up signed checkpoints from the validator and delivers messages on the destination chain.
Step 6.1 — Create relayer DB directory
powershellmkdir hyperlane_db_relayer
Step 6.2 — Run the relayer
Finally, run the relayer: hyperlane
powershelldocker run `
  -it `
  -e CONFIG_FILES=/config/agent-config.json `
  --mount type=bind,source="$env:CONFIG_FILES",target=/config/agent-config.json,readonly `
  --mount type=bind,source="$pwd\hyperlane_db_relayer",target=/hyperlane_db `
  --mount type=bind,source="$pwd\tmp\hyperlane-validator-signatures-kiteozone",target=/tmp/validator-signatures,readonly `
  ghcr.io/hyperlane-xyz/hyperlane-agent:agents-v2.2.0 `
  ./relayer `
  --db /hyperlane_db `
  --relayChains kiteozone,sepolia `
  --allowLocalCheckpointSyncers true `
  --defaultSigner.key 0xYOUR_PRIVATE_KEY_HERE

PHASE 7 — Send a Test Message (Proof It Works)
Open a third terminal:
powershellhyperlane send message --relay --origin kiteozone --destination sepolia
The --relay flag is optional and will deliver the message to the destination chain. Hyperlane
You should see: ✅ Message delivered on sepolia
This is your proof — a message sent from Kite testnet was delivered on Sepolia through your self-hosted Hyperlane infrastructure.

PHASE 8 — Deploy USDC Warp Route (Equivalent of OFT)
This is the ORCA-specific part — bridging USDC between Kite testnet and Sepolia, replacing the LZ OFT.
Step 8.1 — Init warp config
The easiest way to create a HWR deployment config file is with the CLI's config command: hyperlane
powershellhyperlane warp init
When prompted:

Chain 1: kiteozone → type: collateral → address: 0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A (testnet USDC from your ORCA doc)
Chain 2: sepolia → type: synthetic

Step 8.2 — Deploy the Warp Route
Once your configuration is ready, initiate the HWR deployment with hyperlane warp deploy. hyperlane
powershellhyperlane warp deploy
This deploys HypERC20Collateral on Kite testnet and HypERC20 (synthetic) on Sepolia.
Step 8.3 — Test a token transfer
You can initiate a test transfer of a single wei with the following command: hyperlane
powershellhyperlane warp send --relay -w USDC/kiteozone-sepolia

PHASE 9 — Map to ORCA Contracts
Now replace your ORCA document's LZ components:
ORCA (LZ)Your Hyperlane DeploymentLZ_ENDPOINT_KITEMailbox address from kiteozone/addresses.yamlORCAOApp.executeCrossChainRebalance()Call Mailbox.dispatch(sepoliaId, recipient, payload)RemoteAdapter._lzReceive()Implement IMessageRecipient.handle(origin, sender, body)LZBridgeGuardCustom ISM with your multisig thresholdOFT USDC bridgeWarp Route contracts deployed in Phase 8
Update your ORCAOApp.sol:
solidity// Replace:
// ILayerZeroEndpoint(LZ_ENDPOINT).send(...)

// With:
IMailbox(MAILBOX_ADDRESS).dispatch(
    DEST_DOMAIN_ID,      // Sepolia domain = 11155111
    recipientAddress32,  // bytes32 of RemoteAdapter address
    messagePayload       // abi.encode(fromProtocol, toProtocol, amount)
);
And your RemoteAdapter.sol:
solidity// Replace:
// function _lzReceive(...) internal override { ... }

// With:
function handle(
    uint32 _origin,
    bytes32 _sender,
    bytes calldata _body
) external payable {
    // decode _body and execute DeFi rebalance
}

Summary of What You Now Have
ComponentStatusHyperlane Mailbox on Kite testnet✅ Self-deployed (Phase 4)Validator signing Kite checkpoints✅ Running in Docker (Phase 5)Relayer delivering to Sepolia✅ Running in Docker (Phase 6)Test message Kite → Sepolia✅ Verified (Phase 7)USDC Warp Route (OFT equivalent)✅ Deployed (Phase 8)ORCA contract swap-in✅ Mapped (Phase 9)