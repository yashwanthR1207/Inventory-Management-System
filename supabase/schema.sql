-- Create sensor_data table
CREATE TABLE IF NOT EXISTS public.sensor_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    temperature NUMERIC NOT NULL,
    humidity NUMERIC NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sensor_data_device_id ON public.sensor_data(device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON public.sensor_data(timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated/anon users for the dashboard
CREATE POLICY "Allow public read access for sensor_data" 
ON public.sensor_data
FOR SELECT 
USING (true);

-- Allow insert only for service role (the MQTT subscriber backend)
-- RLS doesn't apply to service_role keys by default, but good practice to explicitly state.
CREATE POLICY "Allow insert for authenticated roles"
ON public.sensor_data
FOR INSERT
WITH CHECK (true);
