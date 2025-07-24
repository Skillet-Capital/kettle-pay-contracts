use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use token_messenger_minter_v2::program::TokenMessengerMinterV2;
use token_messenger_minter_v2::token_messenger_v2::instructions::{
    deposit_for_burn_with_hook::DepositForBurnWithHookParams,
    DepositForBurnContext,
};
use message_transmitter_v2::program::MessageTransmitterV2;

// The program ID
declare_id!("4MvgjyyGBGqqjzFV4xQM7Ncnr4Ny2bHMPyi7fyTuemWP");

#[program]
pub mod cctp_burn_hook_wrapper {
    use super::*;

    pub fn execute_burn_hook(ctx: Context<ExecuteBurnHook>, params: BurnParams) -> Result<()> {
        token_messenger_minter_v2::cpi::deposit_for_burn_with_hook(
            CpiContext::new(
                ctx.accounts.token_messenger_minter_program.to_account_info(),
                DepositForBurnContext {
                    owner: ctx.accounts.payer.clone(),
                    event_rent_payer: ctx.accounts.payer.clone(),
                    sender_authority_pda: ctx.accounts.sender_authority_pda.clone(),
                    burn_token_account: ctx.accounts.burn_token_account.clone(),
                    denylist_account: ctx.accounts.denylist_account.clone(),
                    message_transmitter: ctx.accounts.message_transmitter.clone(),
                    token_messenger: ctx.accounts.token_messenger.clone(),
                    remote_token_messenger: ctx.accounts.remote_token_messenger.clone(),
                    token_minter: ctx.accounts.token_minter.clone(),
                    local_token: ctx.accounts.local_token.clone(),
                    burn_token_mint: ctx.accounts.burn_token_mint.clone(),
                    message_sent_event_data: ctx.accounts.message_sent_event_data.clone(),
                    message_transmitter_program: ctx.accounts.message_transmitter_program.clone(),
                    token_messenger_minter_program: ctx.accounts.token_messenger_minter_program.clone(),
                    token_program: ctx.accounts.token_program.clone(),
                    system_program: ctx.accounts.system_program.clone(),
                },
            ),
            DepositForBurnWithHookParams {
                amount: params.amount,
                destination_domain: params.destination_domain,
                mint_recipient: params.mint_recipient,
                destination_caller: params.destination_caller,
                max_fee: params.max_fee,
                min_finality_threshold: params.min_finality_threshold,
                hook_data: params.hook_data.clone(),
            },
        )?;

        emit!(BurnHookExecuted {
            amount: params.amount,
            destination_domain: params.destination_domain,
            mint_recipient: params.mint_recipient,
            destination_caller: params.destination_caller,
            max_fee: params.max_fee,
            min_finality_threshold: params.min_finality_threshold,
        });

        Ok(())
    }
}

// Parameters to pass in to the instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BurnParams {
    pub amount: u64,
    pub destination_domain: u32,
    pub mint_recipient: Pubkey,
    pub destination_caller: Pubkey,
    pub max_fee: u64,
    pub min_finality_threshold: u32,
    pub hook_data: Vec<u8>,
}

#[derive(Accounts)]
pub struct ExecuteBurnHook<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: empty PDA, used to check that sendMessage was called by TokenMessenger
    #[account(
        seeds = [b"sender_authority"],
        bump,
        seeds::program = token_messenger_minter_v2::ID
    )]
    pub sender_authority_pda: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = burn_token_account.mint == burn_token_mint.key(),
        constraint = burn_token_account.owner == payer.key()
    )]
    pub burn_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: denylist PDA - Account is denylisted if the account exists at the expected PDA
    #[account(
        seeds = [b"denylist_account", payer.to_account_info().key().as_ref()],
        bump,
        seeds::program = token_messenger_minter_v2::ID
    )]
    pub denylist_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub burn_token_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub message_transmitter: Box<Account<'info, message_transmitter_v2::state::MessageTransmitter>>,
    
    #[account(mut)]
    pub token_messenger: Box<Account<'info, token_messenger_minter_v2::token_messenger_v2::state::TokenMessenger>>,
    
    #[account(mut)]
    pub remote_token_messenger: Box<Account<'info, token_messenger_minter_v2::token_messenger_v2::state::RemoteTokenMessenger>>,
    
    #[account(mut)]
    pub token_minter: Box<Account<'info, token_messenger_minter_v2::token_minter_v2::state::TokenMinter>>,

    /// CHECK: Local token PDA
    #[account(
        mut,
        seeds = [
            b"local_token",
            burn_token_mint.key().as_ref(),
        ],
        bump,
        seeds::program = token_messenger_minter_v2::ID
    )]
    pub local_token: Box<Account<'info, token_messenger_minter_v2::token_minter_v2::state::LocalToken>>,

    /// CHECK: Created PDA for MessageSent event data
    #[account(mut)]
    pub message_sent_event_data: Signer<'info>,

    pub message_transmitter_program: Program<'info, MessageTransmitterV2>,
    pub token_messenger_minter_program: Program<'info, TokenMessengerMinterV2>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct BurnHookExecuted {
    pub amount: u64,
    pub destination_domain: u32,
    pub mint_recipient: Pubkey,
    pub destination_caller: Pubkey,
    pub max_fee: u64,
    pub min_finality_threshold: u32,
}
