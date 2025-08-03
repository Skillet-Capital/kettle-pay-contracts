// programs/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("8chVyMSYr9656RbsYsY9VyUw1seCwm5vbwe8vydmZW76");

#[program]
pub mod order_event_program {
    use super::*;

    pub fn emit_order_event(ctx: Context<EmitOrderEvent>, order_id: [u8; 32]) -> Result<()> {
        emit!(OrderCreated {
            order_id,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Order event emitted with ID: {:?}", order_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct EmitOrderEvent<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct OrderCreated {
    pub order_id: [u8; 32], // bytes32 equivalent
    pub timestamp: i64,
}

#[error_code]
pub enum OrderEventError {
    #[msg("Invalid order ID")]
    InvalidOrderId,
}