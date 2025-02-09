import fs from "fs"
import hre from "hardhat"
import { Wallet, parseEther, keccak256 } from "ethers"
import { generateRSAKeyPair, decryptRSA, sign } from "./crypto"

let pks = process.env.SIGNING_KEYS ? process.env.SIGNING_KEYS.split(",") : []

export type User = Awaited<ReturnType<typeof setupAccounts>>[number]

export async function setupAccounts() {
  if (pks.length == 0) {
    const key1 = hre.ethers.Wallet.createRandom(hre.ethers.provider)
    const key2 = hre.ethers.Wallet.createRandom(hre.ethers.provider)
    pks = [key1.privateKey, key2.privateKey]

    setEnvValue("SIGNING_KEYS", `${key1.privateKey},${key2.privateKey}`)

    throw new Error(`Created new random account ${key1.address}. Please use faucet to fund it.`)
  }

  const wallets = pks.map((pk) => new hre.ethers.Wallet(pk, hre.ethers.provider))
  if ((await hre.ethers.provider.getBalance(wallets[0].address)) === BigInt("0")) {
    throw new Error(`Please use faucet to fund account ${wallets[0].address}`)
  }

  let userKeys = process.env.USER_KEYS ? process.env.USER_KEYS.split(",") : []

  if (userKeys.length !== wallets.length) {
    await (await wallets[0].sendTransaction({ to: wallets[1].address, value: parseEther("0.1") })).wait()

    const contract = await deploy(wallets[0])
    userKeys = await Promise.all(wallets.map(async (account) => await onboard(contract, account)))
    setEnvValue("USER_KEYS", userKeys.join(","))
  }

  return wallets.map((wallet, i) => ({ wallet, userKey: userKeys[i] }))
}

async function deploy(owner: Wallet) {
  const factory = await hre.ethers.getContractFactory("AccountOnboard", owner)
  const contract = await factory.connect(owner).deploy({ gasLimit: 12000000 })
  return contract.waitForDeployment()
}

async function onboard(contract: Awaited<ReturnType<typeof deploy>>, user: Wallet) {
  const { publicKey, privateKey } = generateRSAKeyPair()

  const signedEK = sign(keccak256(publicKey), user.privateKey)
  const receipt = await (
    await contract.connect(user).OnboardAccount(publicKey, signedEK, { gasLimit: 12000000 })
  ).wait()
  if (!receipt || !receipt.logs || !receipt.logs[0]) {
    throw new Error("failed to onboard, receipt or receipt.logs or receipt.logs[0] is undefined")
  }
  const log = receipt.logs[0]
  const eventFragment = contract.interface.getEvent("AccountOnboarded")
  const decodedEvent = contract.interface.decodeEventLog(eventFragment, log.data, log.topics)
  const encryptedKey = decodedEvent.userKey
  const buf = Buffer.from(encryptedKey.substring(2), "hex")
  return decryptRSA(privateKey, buf).toString("hex")
}

function setEnvValue(key: string, value: string) {
  fs.appendFileSync("./.env", `\n${key}=${value}`, "utf8")
}
