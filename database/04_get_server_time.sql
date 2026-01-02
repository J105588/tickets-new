-- Create a function to get server time
-- This allows the frontend to sync with the database clock, preventing users from bypassing deadlines by changing their device time.

CREATE OR REPLACE FUNCTION get_server_time() 
RETURNS TIMESTAMPTZ 
LANGUAGE sql 
AS $$
  SELECT now();
$$;
