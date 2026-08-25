
# bloxybattles

## PS99 withdrawal bot setup

1. Apply `supabase/migrations/20260825000000_bloxdice_bootstrap.sql` before
   deploying the server. Back up an existing database first because this is the
   consolidated schema for the retained systems.
2. Generate a long random secret and set `PS99_BOT_API_SECRET` in the server
   environment. Do not use a Supabase key as the bot secret.
3. Set the same secret only in the bot executor before loading `ps99.lua`:

   ```lua
   getgenv().PS99_BOT_API_SECRET = "your-random-bot-secret"
   loadstring(readfile("ps99.lua"))()
   ```

The secret must not be committed to the repository. Pending withdrawals remain
claimed while a trade is active; canceled, failed, and partial trades release
unfulfilled items for another bot.
