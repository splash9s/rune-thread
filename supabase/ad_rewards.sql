-- Rune Thread: AdMob rewarded ads in the Android app. Run once in the SQL editor of project krtzvossvqddhveozcnb.
-- The admob-ssv function writes a row when AdMob confirms a player earned a reward (transaction_id is unique,
-- so Google's retries cannot add a second row). The game calls claim_ad_reward(slot, nonce) when the player
-- returns from the ad; it is true once for that ad and gives the reward in the game.

create table if not exists public.ad_rewards (
  transaction_id text primary key,
  user_id uuid not null,
  slot text not null,
  nonce text not null,
  ad_unit text,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists ad_rewards_nonce_idx on public.ad_rewards (user_id, nonce);

-- No policies: players reach the table only through claim_ad_reward()
alter table public.ad_rewards enable row level security;

create or replace function public.claim_ad_reward(p_slot text, p_nonce text) returns boolean
language sql security definer set search_path = public as $$
  with c as (
    update public.ad_rewards
       set claimed = true
     where user_id = auth.uid() and slot = p_slot and nonce = p_nonce and claimed = false
       and created_at > now() - interval '1 hour'
    returning 1
  )
  select exists (select 1 from c);
$$;

revoke all on function public.claim_ad_reward(text, text) from public;
grant execute on function public.claim_ad_reward(text, text) to authenticated;
