import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ibwuozucqkeylykndign.supabase.co';
const supabaseAnonKey = 'sb_publishable_aizrKrP8OKsX6u4SXEl35A_YHf7ywbg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);