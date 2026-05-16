async function main(): Promise<void> {
  console.log("Seed disabled: ORCA now uses live agent, on-chain, and indexed vault data only.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
