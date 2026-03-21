-- Migration 004: Add coins to profiles and bets to rooms

alter table profiles
  add column if not exists coins integer not null default 0;

alter table rooms
  add column if not exists bets jsonb not null default '{}';
