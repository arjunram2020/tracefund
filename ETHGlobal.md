# **TraceFund PRD**

## **Crowdfunding with Enforced Accountability**

### **Project Summary**

TraceFund is a milestone-based crowdfunding platform built on Ethereum. It fixes a major trust problem in traditional donation platforms: once money is donated, donors usually have little visibility or control over whether the money is actually used as promised.

On TraceFund, donations do not go directly to the campaign creator. Instead, funds are held inside a smart contract escrow. The creator can only unlock money milestone by milestone after submitting public evidence and receiving donor approval.

The core idea is simple:

Donors should not have to blindly trust a campaign creator or a platform. The money should follow the proof.

---

## **1\. The Problem**

Traditional crowdfunding platforms like GoFundMe rely heavily on trust.

A person can raise money for a medical bill, emergency relief fund, charity cause, school project, or community need. Donors send money because the story feels real. But after the money moves, donors usually have no enforceable way to verify what happened next.

The current system has three major weaknesses:

1. Donors have to trust the campaign creator.  
2. Donors have to trust the platform.  
3. Updates are optional and do not control whether money gets released.

This creates room for scams, vague updates, abandoned campaigns, and misuse of funds.

Even when a campaign is honest, donors still lack a clear public trail showing how funds were used.

---

## **2\. Workflow**

TraceFund makes crowdfunding accountable by changing the money flow.

Instead of sending donations directly to the creator, TraceFund sends donations into a smart contract escrow. The creator creates a campaign with specific milestones. Users get to describe what the milestones are but the milestones themselves stay flexible/realistic. Each milestone has a description and an amount of money attached to it. 

To unlock a milestone, the creator must:

1. Submit evidence.  
2. Wait for donors to approve the milestone.  
3. Trigger the smart contract release after the approval threshold is reached.

Only then does the contract release the exact milestone amount.

This creates a public, tamper-resistant accountability trail:

* who donated  
* how much was donated  
* what milestone the money was for  
* what evidence was submitted  
* which donors approved the milestone  
* when funds were released  
* how much was released

Smart Contract:

Store campaign info

Record donations

Hold the money

Record evidence

Count votes and release funds when threshold hit

---

## **3\. One-Sentence Pitch**

TraceFund is a crowdfunding platform where donations stay locked in smart contract escrow until campaign creators submit milestone evidence and donors approve the release.

---

## **4\. Why Blockchain Actually Matters Here**

This should not be a blockchain project just for the sake of being a blockchain project.

Blockchain is useful here because the important records need to be public, tamper-resistant, and enforceable.

A normal database could track donations and evidence, but users would still have to trust the company running that database. The company could edit records, hide bad history, delete reputation data, or release money manually.

TraceFund uses Ethereum for the parts that should not depend on trust:

* donation records  
* escrow balances  
* milestone definitions  
* evidence submission records  
* donor approvals  
* fund releases  
* creator reputation history

The frontend can still be a normal web app. The blockchain is only used for the money and accountability layer.

---

## **5\. Target Users**

### **Donors**

People who want to support a cause but want more confidence that their money will be used correctly.

Examples:

* medical fund donors  
* emergency relief donors  
* local community donors  
* student organization donors  
* mutual aid donors  
* charity supporters

  ### **Campaign Creators**

People or organizations raising money who want to prove they are trustworthy.

Examples:

* individuals raising emergency funds  
* local nonprofits  
* student clubs  
* community organizers  
* small charities  
* school project teams

  ### **Verifiers / Viewers**

People who may not donate but want to inspect the public campaign record.

Examples:

* journalists  
* community members  
* future donors  
* grant providers  
* sponsors  
  ---

  ## **6\. Core User Flow**

  ### **Campaign Creator Flow**

1. Creator connects wallet.  
2. Creator creates a campaign.  
3. Creator adds a title, description, and milestones.  
4. Donors contribute ETH into the campaign escrow.  
5. Creator submits evidence for the current milestone.  
6. Donors approve the milestone.  
7. Contract releases the milestone amount.  
8. Creator reputation improves as milestones are completed.

   ### **Donor Flow**

1. Donor connects wallet.  
2. Donor views campaign details.  
3. Donor sees milestones, creator reputation, and current funding status.  
4. Donor donates ETH into escrow.  
5. Donor waits for creator evidence.  
6. Donor reviews evidence.  
7. Donor approves the milestone.  
8. Donor watches the contract release funds publicly.

   ### **Public Viewer Flow**

1. Viewer opens campaign page.  
2. Viewer sees the full donation and milestone history.  
3. Viewer can inspect evidence and fund release records.  
4. Viewer can judge whether the creator is trustworthy.  
   ---

   ## **7\. MVP Scope**

The MVP should be extremely focused.

The minimum working demo needs to show:

1. A creator creates a campaign with milestones.  
2. A donor donates ETH.  
3. The ETH is locked in the smart contract.  
4. The creator submits evidence for milestone one.  
5. Donors approve the milestone.  
6. The contract releases only the milestone amount.  
7. The campaign page updates to show what happened.

Everything else is secondary.

---

## **8\. What We Are NOT Building in the MVP**

To keep the hackathon build realistic, do not include these in the first version:

* no real money  
* no Ethereum mainnet deployment  
* no complex backend  
* no database  
* no full charity verification system  
* no legal compliance layer  
* no real KYC  
* no complex dispute court  
* no automatic scam detection  
* no AI moderation  
* no advanced analytics  
* no full IPFS file upload unless the core flow already works

The first version should prove the core mechanism:

Money is locked until proof and donor approval unlock it.

---

## **9\. Recommended Tech Stack**

### **Base Framework**

Use Scaffold-ETH 2\.

Scaffold-ETH 2 is the best hackathon foundation because it already includes:

* Next.js  
* TypeScript  
* Hardhat  
* Solidity  
* RainbowKit  
* wagmi  
* viem  
* local blockchain  
* wallet connection  
* contract deployment tools  
* debug contract UI  
* frontend contract hooks

This saves time and reduces setup mistakes.

### **Smart Contract (existing smart contract)** 

Use Solidity with Hardhat.

The smart contract should handle:

* campaign creation  
* donations  
* milestone evidence  
* donor approvals  
* milestone fund release  
* creator reputation stats

Examples from open-source smart contracts(read these):

Escrow.sol:  
**import "@openzeppelin/contracts/utils/escrow/Escrow.sol";**

**import "@openzeppelin/contracts/utils/escrow/ConditionalEscrow.sol";**

**import "@openzeppelin/contracts/utils/escrow/RefundEscrow.sol";**

### **Frontend**

Use the Scaffold-ETH 2 Next.js app.

The frontend should include:

* landing page  
* campaign list  
* campaign detail page  
* create campaign page  
* creator dashboard  
* donation panel  
* milestone timeline  
* approval panel  
* reputation badge

  ### **Wallets**

Use RainbowKit through Scaffold-ETH 2\.

This gives the project a clean wallet connection flow without needing to build one from scratch.

## **Deployment Strategy**

Use **Base Mainnet** as the first production deployment network. Do **not** use Base Sepolia as the main deployment target.

TraceFund should be built as a generic EVM-compatible Solidity dApp so the same contract can later be deployed to **Ethereum Mainnet** without major rewrites.

### **Deployment Plan**

1. Build and test locally with Scaffold-ETH 2 and Hardhat.  
2. Run the full app locally through the Scaffold-ETH frontend.  
3. Deploy the first production version to **Base Mainnet**.  
4. Run small-value production smoke tests on Base Mainnet using tiny real ETH amounts.  
5. Deploy the frontend connected to the Base Mainnet contract.  
6. After the Base deployment is stable, deploy the same contract architecture to **Ethereum Mainnet** as a future production deployment.

### **Why Base First**

Base is an Ethereum Layer 2, so it supports Solidity, Hardhat, Scaffold-ETH 2, wagmi, viem, and RainbowKit. It is faster and cheaper than Ethereum Mainnet, which makes it a better first production network for the hackathon demo.

### **Ethereum Mainnet Later**

Ethereum Mainnet should be treated as a later production deployment, not a test environment. The contract should not contain Base-specific assumptions so it can be redeployed to Ethereum Mainnet later.

### **Safety Rule**

Because Base Mainnet and Ethereum Mainnet both use real ETH, all hackathon demo transactions must use tiny amounts only.

Suggested demo values:

* 0.0001 ETH  
* 0.0002 ETH  
* 0.0005 ETH

The goal is to prove real on-chain escrow works, not to move meaningful money.

---

## **10\. Smart Contract Design**

The smart contract is the core of TraceFund.

It should be named:

TraceFund.sol

The contract should store campaigns, milestones, donations, donor approvals, and creator reputation.

### **Campaign Data**

Each campaign should include:

* campaign ID  
* creator wallet address  
* title  
* description  
* goal amount  
* total raised  
* total released  
* whether campaign is active  
* whether campaign is completed  
* current milestone index  
* creation timestamp  
* donor count  
* milestone list

  ### **Milestone Data**

Each milestone should include:

* description  
* amount  
* evidence string  
* whether evidence was submitted  
* approval weight  
* approval base  
* whether funds were released

  ### **Donation Data**

The contract should track:

* how much each donor gave to each campaign  
* the list of donors for each campaign  
* whether each donor approved a milestone

  ### **Reputation Data**

The contract should track each creator’s history:

* campaigns created  
* campaigns completed  
* total raised  
* total released  
* milestones completed  
* evidence updates submitted  
  ---

  ## **11\. Donor Approval System**

The donor approval system is what makes TraceFund stronger than a basic escrow demo.

The creator should not be able to submit evidence and immediately release their own money.

Instead:

1. Creator submits evidence.  
2. Donors review the evidence.  
3. Donors approve the milestone.  
4. Once enough donor approval is reached, funds can be released.

Approval should be weighted by donation amount.

Example:

* Donor A gives 0.01 ETH.  
* Donor B gives 0.04 ETH.  
* Donor B has more approval weight because they contributed more money.

For the MVP, the approval threshold should be 50% of donated funds.

That means if donors representing at least 50% of the campaign’s raised amount approve the milestone, the milestone can be released.

---

## **12\. Core Smart Contract Functions**

### **createCampaign**

The creator creates a campaign with:

* title  
* description  
* milestone descriptions  
* milestone amounts

The contract calculates the goal amount by adding up all milestone amounts.

Rules:

* The title cannot be empty  
* Description cannot be empty  
* The campaign must have at least one milestone  
* A campaign can have a maximum of five milestones  
* milestone amounts must be greater than zero

  ### **donate**

A donor sends ETH to a campaign.

Rules:

* campaign must exist  
* campaign must be active  
* donation amount must be greater than zero  
* donation is stored in the contract  
* donor is added to campaign donor list  
* campaign raised amount increases

  ### **submitEvidence**

The creator submits evidence for the current milestone.

Rules:

* only the campaign creator can submit evidence  
* evidence cannot be empty  
* evidence can be a URL, IPFS CID, or text string for MVP  
* submitting evidence does not release money

  ### **approveMilestone**

A donor approves the current milestone.

Rules:

* caller must be a donor  
* evidence must already be submitted  
* donor can only approve once per milestone  
* approval weight equals donor’s donation amount

  ### **releaseMilestoneFunds**

Once enough donors approve, funds can be released.

Rules:

* milestone must have evidence  
* approval threshold must be reached  
* milestone must not already be released  
* contract must have enough ETH  
* exact milestone amount is transferred to creator  
* campaign advances to next milestone  
* if final milestone is released, campaign is completed  
  ---

  ## **13\. Frontend Pages**

  ### **Home Page**

The home page should explain the product quickly.

Sections:

* headline: “Crowdfunding with enforced accountability”  
* subtext: “Donations stay locked until campaign creators submit evidence and donors approve each milestone.”  
* call-to-action buttons:  
  * View Campaigns  
  * Create Campaign  
* three-step explanation:  
  * Donate into escrow  
  * Creator submits evidence  
  * Donors approve and funds unlock

  ### **Campaigns Page**

Shows all campaigns.

Each campaign card should show:

* campaign title  
* creator address  
* raised amount  
* goal amount  
* progress bar  
* current milestone  
* donor count  
* campaign status  
* trust score badge  
* view button

  ### **Campaign Detail Page**

This is the most important demo page.

It should show:

* campaign title  
* description  
* creator address  
* trust score  
* raised amount  
* goal amount  
* released amount  
* current milestone  
* milestone timeline  
* donation panel  
* evidence panel  
* donor approval panel  
* release funds button  
* public activity feed

The judge should be able to understand the whole project from this page alone.

### **Create Campaign Page**

Lets a creator create a new campaign.

Inputs:

* title  
* description  
* milestone descriptions  
* milestone amounts

Validation:

* title required  
* description required  
* at least one milestone  
* maximum five milestones  
* every milestone amount must be greater than zero

The page should automatically calculate the total goal amount from milestones.

### **Creator Dashboard**

Shows campaigns created by the connected wallet.

Should include:

* creator trust score  
* creator stats  
* campaigns created by this wallet  
* links to manage each campaign

Keep this simple. Most actions can happen on the campaign detail page.

---

## **14\. Main Components**

### **CampaignCard**

Displays a summary of a campaign.

Should show:

* title  
* creator  
* raised / goal  
* current milestone  
* status  
* trust badge  
* view button

  ### **DonationPanel**

Lets a connected wallet donate ETH.

Should include:

* amount input  
* donate button  
* transaction loading state  
* transaction success state  
* transaction error state

  ### **MilestoneTimeline**

Shows all milestones and their status.

Possible statuses:

* locked  
* awaiting evidence  
* evidence submitted  
* awaiting donor approval  
* ready to release  
* released

  ### **EvidencePanel**

Lets the creator submit milestone evidence.

For viewers, it displays submitted evidence.

### **DonorApprovalPanel**

Lets donors approve a milestone after evidence is submitted.

Should show:

* whether connected wallet donated  
* user’s approval weight  
* whether user already approved  
* approval button

  ### **ReputationBadge**

Shows the creator’s reputation score.

Suggested labels:

* 0–19: New Creator  
* 20–49: Early Creator  
* 50–79: Proven Creator  
* 80–100: Trusted Creator  
  ---

  ## **15\. Demo Campaign**

Use this demo campaign during judging.

### **Title**

Community Medical Relief Fund

### **Description**

A transparent emergency fundraiser where donations unlock only after milestone proof is submitted and donors approve the release.

### **Milestones**

1. Hospital deposit receipt — 0.02 ETH  
2. Medication purchase receipt — 0.015 ETH  
3. Follow-up appointment confirmation — 0.015 ETH

   ### **Total Goal**

0.05 ETH

---

## **16\. Demo Setup**

Prepare three test wallets:

1. Creator wallet  
2. Donor wallet A  
3. Donor wallet B

Before the live demo:

1. Create the campaign.  
2. Donate from donor A.  
3. Donate from donor B.  
4. Leave milestone one waiting for evidence.

During the live demo:

1. Show the campaign page.  
2. Show that funds are locked.  
3. Submit evidence as the creator.  
4. Approve the milestone as donor A.  
5. Approve the milestone as donor B if needed.  
6. Release milestone funds.  
7. Show the milestone status update.  
8. Show creator reputation update.  
   ---

   ## **17\. Demo Script**

Most crowdfunding platforms have a trust problem. You donate, the money moves, and after that you mostly rely on screenshots, vague updates, or platform moderation.

TraceFund changes the money flow. Donations do not go straight to the campaign creator. They go into a smart contract escrow.

Here is the campaign. You can see the total raised, the milestones, and the current status. The first milestone is locked because no evidence has been submitted yet.

Now the creator submits evidence for milestone one. This creates a public on-chain update.

But evidence alone is not enough. The donors who funded the campaign approve the milestone. Their approval weight is based on how much they donated.

Once the approval threshold is met, anyone can trigger release. The contract releases exactly the milestone amount. Nothing more. The rest stays locked for future milestones.

Every donation, evidence update, approval, and release is part of the public record. Over time, creators build a reputation trail that no platform can quietly edit or delete.

GoFundMe asks donors to trust a black box. TraceFund makes the money follow the proof.

---

## **18\. Build Plan**

### **Phase 1: Smart Contract Foundation**

Goal:

Get the contract compiling, tested, and working locally.

Tasks:

* initialize Scaffold-ETH 2 project  
* create TraceFund.sol  
* implement campaign creation  
* implement donations  
* implement evidence submission  
* implement donor approval  
* implement milestone fund release  
* emit events  
* write tests  
* deploy locally  
* test through Scaffold-ETH debug UI

Do not build the full frontend until this works.

### **Phase 2: Core Frontend**

Goal:

Make the full user flow work in the browser.

Tasks:

* build landing page  
* build campaign list page  
* build campaign detail page  
* build create campaign page  
* build donation panel  
* build milestone timeline  
* build evidence submission panel  
* build donor approval panel  
* build release funds button  
* show transaction states

  ### **Phase 3: Testnet Deployment**

Goal:

Deploy a real contract to a public testnet.

Tasks:

* configure testnet  
* fund deployer wallet with testnet ETH  
* deploy contract  
* update frontend contract address  
* test every transaction on testnet  
* save contract address for submission

  ### **Phase 4: Polish and Demo**

Goal:

Make the product easy to understand.

Tasks:

* add clean UI styling  
* add progress bars  
* add status labels  
* add transaction success messages  
* add activity feed if time allows  
* create demo campaign  
* rehearse demo repeatedly  
* record demo video

  ### **Phase 5: Submission**

Goal:

Submit a polished hackathon project.

Tasks:

* deploy frontend to Vercel  
* publish GitHub repo  
* write README  
* add screenshots  
* add live demo link  
* add deployed contract address  
* submit project page  
  ---

  ## **19\. Team Split**

  ### **Person 1: Smart Contract Lead**

Owns:

* Solidity contract  
* Hardhat tests  
* deployment  
* contract debugging

  ### **Person 2: Frontend Web3 Lead**

Owns:

* wallet connection  
* contract reads  
* contract writes  
* transaction states  
* event fetching

  ### **Person 3: UI/Product Lead**

Owns:

* page layout  
* visual design  
* campaign detail page  
* demo clarity

  ### **Person 4: Pitch/Story Lead**

Owns:

* README  
* demo script  
* submission copy  
* screenshots  
* judging explanation

  ### **Person 5: QA/Deployment Floater**

Owns:

* bug testing  
* wallet setup  
* faucet setup  
* Vercel deployment  
* final polish  
  ---

  ## **20\. Scope Cuts**

If the team is behind, cut features in this order:

1. Creator dashboard  
2. Campaign listing page  
3. Reputation labels  
4. Activity feed  
5. IPFS upload  
6. Contract verification  
7. Nice landing page  
8. Sponsor integrations

Never cut:

* create campaign  
* donate  
* submit evidence  
* donor approval  
* release milestone funds  
* campaign detail page  
* deployed contract  
* working demo

The minimum viable demo is:

One campaign. Two donors. One evidence submission. Donor approval. One milestone release.

---

## **21\. Optional Sponsor Integrations**

Only add these after the core product works.

### **World ID**

Use World ID to verify that campaign creators are unique humans.

This helps prevent one person from creating many fake charity campaigns.

### **ENS**

Use ENS to display readable creator names instead of raw wallet addresses.

Example:

Instead of 0x9fA2... show nityanth.eth.

### **Dynamic or Privy**

Use Dynamic or Privy to make wallet onboarding easier for normal users.

This is useful because crowdfunding should be accessible to people who do not already use crypto wallets.

### **Chainlink**

Use Chainlink only if we add a real need for external data or attestations.

Do not force Chainlink into the project unless it has an actual purpose.

---

## **22\. Why This Can Win**

TraceFund is strong because the blockchain part is not random. The product actually needs public, tamper-resistant records and enforceable money flow.

The demo is also easy to understand:

Old model:

Donate money and hope the creator uses it correctly.

TraceFund model:

Donate money into escrow. Funds unlock only after evidence and donor approval.

That contrast is simple, visual, and practical.

Judges should immediately understand:

* what problem it solves  
* why Ethereum matters  
* what the smart contract does  
* how the user benefits  
* why this is better than a normal database  
  ---

  ## **23\. First Claude Code Task**

Use this as the first instruction to Claude Code:

Build TraceFund using Scaffold-ETH 2\.

Start by creating the smart contract and tests before building the frontend.

Implement a Solidity contract called TraceFund.sol that supports:

1. campaign creation with milestones  
2. ETH donations into escrow  
3. creator evidence submission  
4. donor milestone approval  
5. milestone fund release after approval threshold  
6. creator reputation stats

Then write tests covering:

1. campaign creation  
2. donations  
3. evidence submission  
4. failed release without approval  
5. donor approval  
6. successful milestone release  
7. campaign completion  
8. trust score update

Do not build frontend pages until the contract tests pass.

---

## **24\. Final Product Principle**

Keep the product simple.

TraceFund is not trying to solve all charity fraud in one weekend.

TraceFund is proving one powerful mechanism:

When donations are locked in escrow and released only after public proof and donor approval, crowdfunding becomes more accountable.

* 

