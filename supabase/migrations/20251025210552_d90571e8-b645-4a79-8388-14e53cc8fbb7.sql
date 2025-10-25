-- Set replica identity to full to get complete row data on DELETE
ALTER TABLE players REPLICA IDENTITY FULL;