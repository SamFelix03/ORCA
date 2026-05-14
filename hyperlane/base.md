msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,320p' ~/.hyperlane/chains/kitetestnet/addresses.yaml
domainRoutingIsmFactory: "0xb09Adbd0CBFf2F62BAD98A6Ec46620E581A3831c"
incrementalDomainRoutingIsmFactory: "0x82602F0888a8ee5b276523daFE74b46FFc7e3051"
interchainAccountRouter: "0xe6692b5e9a229E66569f3d94092ad301D1fE6B43"
mailbox: "0x0d5b681C5887617d68200B45F3947c99Cf402188"
merkleTreeHook: "0xd6Ea22b0932529F9B92A944a8c8A6d2b70af8aE2"
proxyAdmin: "0x2c1f31d27645be47E0907D2eAa6A4f36F045BaE0"
quotedCalls: "0x385b53238468b5B453129B192aaAA1d869788885"
staticAggregationHookFactory: "0x805651a9377DeC00F4e6b719db3aA5221536D1B9"
staticAggregationIsmFactory: "0x5aDf80928f6f0Fa2C2D9Abb2FBf66e89557989bd"
staticMerkleRootMultisigIsmFactory: "0x71cA3A72aB0d4b9898674B78C474ED1325D6Dc0b"
staticMerkleRootWeightedMultisigIsmFactory: "0x84a55a9e35dC1A966b7b1494560240Cb3f879871"
staticMessageIdMultisigIsmFactory: "0xC420bA7e7c1115Ce46d460921f1ead58F0Ed7f69"
staticMessageIdWeightedMultisigIsmFactory: "0xAdBEE71c3fB30aB99cd414269CbeE0bBF50f1747"
testRecipient: "0xc5E78532225B18e174FeCe089A854ac628179476"
validatorAnnounce: "0x077Dc8fd76e3E547aE52E538520c0621AACB22D0"
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,260p' ~/.hyperlane/chains/kitetestnet/metadata.yaml
# yaml-language-server: $schema=../schema.json

blockExplorers:
  - apiUrl: https://testnet.kitescan.ai/api
    family: blockscout
    name: kite-testnet explorer
    url: https://testnet.kitescan.ai

blocks:
  confirmations: 1
  estimateBlockTime: 2
  reorgPeriod: 0

chainId: 2368
displayName: Kitetestnet
domainId: 2368
isTestnet: true
name: kitetestnet

nativeToken:
  decimals: 18
  name: Kite
  symbol: KITE

protocol: ethereum

rpcUrls:
  - http: https://rpc-testnet.gokite.ai

transactionOverrides:
  gasPrice: 20000000000

technicalStack: other
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,260p' ~/.hyperlane/chains/basesepolia/metadata.yaml
# yaml-language-server: $schema=../schema.json
blockExplorers:
  - apiKey: R8CVTG7HDJYD5JDV2GSD5TGQH3J2KJDSSY
    apiUrl: https://api-sepolia.basescan.org/api
    family: etherscan
    name: BaseScan
    url: https://sepolia.basescan.org
blocks:
  confirmations: 1
  estimateBlockTime: 2
  reorgPeriod: 1
chainId: 84532
deployer:
  name: Abacus Works
  url: https://www.hyperlane.xyz
displayName: Base Sepolia
domainId: 84532
gasCurrencyCoinGeckoId: ethereum
isTestnet: true
name: basesepolia
nativeToken:
  decimals: 18
  name: Ether
  symbol: ETH
protocol: ethereum
rpcUrls:
  - http: https://sepolia.base.org
  - http: https://base-sepolia-rpc.publicnode.com
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,320p' ~/.hyperlane/chains/basesepolia/addresses.yaml
domainRoutingIsmFactory: "0x417fe09713AdC16498a6dcE1a4fc0E60d003D4Aa"
incrementalDomainRoutingIsmFactory: "0x1dCf970eF4BDD381Be6ebdAcFaF5ADAdFe92c113"
interchainAccountRouter: "0x150b1d7AABF5Bb37928824D3dBf4e50144A175D3"
mailbox: "0x68e89453029DC14351bF72104dC30248BB766b69"
merkleTreeHook: "0x6229BC5BB9c37F4B9C823584e7fC7DE844F380DF"
proxyAdmin: "0xB89aedA029aB6444ba9022B4aBcC19ca857619E0"
quotedCalls: "0x634C4A18d512d2c6fF2c9B9504ca2660e5507a0b"
staticAggregationHookFactory: "0xCaac39B83a1Ed28d829d12648FD83123eb4a2041"
staticAggregationIsmFactory: "0xC3Fd1E9B228Fc285dcC8050DA63B793ad113c019"
staticMerkleRootMultisigIsmFactory: "0xE1A2A617976E659b2c42204B87937037dcE6B99e"
staticMerkleRootWeightedMultisigIsmFactory: "0x51dC9cE9f288f07C7b6a5aF62836197ca4458E93"
staticMessageIdMultisigIsmFactory: "0xC64Ab8760d89b567F51C060EC31Da9a7f6C4C01b"
staticMessageIdWeightedMultisigIsmFactory: "0x1cd4e7b3B225485A92b2094164b891237aBAf5F4"
testRecipient: "0x1C61AD8288036df7e14C6A9B5D9e11b6631D6890"
validatorAnnounce: "0x895593F5DA13e9486236740883659623Ec01Dc4a"
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ rg -n "domainId|chainId|mailbox|interchainGasPaymaster|defaultIsm|ism|hook" ~/.hyperlane/chains/kitetestnet ~/.hyperlane/chains/basesepolia
Command 'rg' not found, but can be installed with:
sudo snap install ripgrep  # version 12.1.0, or
sudo apt  install ripgrep  # version 14.0.3-1
See 'snap info ripgrep' for additional versions.
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ ls -la ~/.hyperlane/deployments/warp_routes
total 12
drwxr-xr-x 3 msi msi 4096 May 14 09:07 .
drwxr-xr-x 3 msi msi 4096 May 14 09:07 ..
drwxr-xr-x 2 msi msi 4096 May 14 09:15 USDC
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ ls -la ~/.hyperlane/deployments/warp_routes/USDC
total 16
drwxr-xr-x 2 msi msi 4096 May 14 09:15 .
drwxr-xr-x 3 msi msi 4096 May 14 09:07 ..
-rw-r--r-- 1 msi msi  673 May 14 09:15 kitetestnet-basesepolia-config.yaml
-rw-r--r-- 1 msi msi  754 May 14 09:15 kitetestnet-basesepolia-deploy.yaml
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,320p' ~/.hyperlane/deployments/warp_routes/USDC/kitetestnet-basesepolia-config.yaml
# yaml-language-server: $schema=../schema.json
tokens:
  - addressOrDenom: "0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc"
    chainName: kitetestnet
    collateralAddressOrDenom: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
    connections:
      - token: ethereum|basesepolia|0x2eD22aA87C87E4B0139552d50CB5B049E369C295
    decimals: 18
    name: Test USD
    standard: EvmHypCollateral
    symbol: USDT
  - addressOrDenom: "0x2eD22aA87C87E4B0139552d50CB5B049E369C295"
    chainName: basesepolia
    connections:
      - token: ethereum|kitetestnet|0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc
    decimals: 18
    name: Test USD
    standard: EvmHypSynthetic
    symbol: USDT
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ rg -n "route|router|address|collateral|synthetic|token|kitetestnet|basesepolia" ~/.hyperlane/deployments/warp_routes/USDC
Command 'rg' not found, but can be installed with:
sudo snap install ripgrep  # version 12.1.0, or
sudo apt  install ripgrep  # version 14.0.3-1
See 'snap info ripgrep' for additional versions.
msi@DESKTOP-8T9U929:/mnt/c/Users/MSI/hyperlane-run$ sed -n '1,220p' /mnt/c/Users/MSI/Desktop/ORCA/contracts/.env
KITE_MAINNET_RPC=https://rpc.gokite.ai
KITE_TESTNET_RPC=https://rpc-testnet.gokite.ai
DEPLOYER_PRIVATE_KEY=
DEPLOY_NETWORK=kiteTestnet
INITIAL_OWNER=
EXECUTOR_VAULT=
TREASURY_MULTISIG=
SETTLEMENT_TOKEN=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63
LZ_ENDPOINT_KITE=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
LZ_EXECUTOR=0x4208D6E27538189bB48E603D6123A94b8Abe0A0b
BRIDGE_GUARD_THRESHOLD_USDC=50000000000
DEFAULT_SPENDING_WINDOW_SECONDS=86400
DEFAULT_SPENDING_BUDGET_USDC=5000000000
DEFAULT_MAX_PER_TX_USDC=500000000