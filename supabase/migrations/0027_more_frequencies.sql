-- Bi-weekly and irregular schedules, for pledges (and their payments) brought over from DonorPerfect. The online
-- giving forms still offer one-time, monthly and yearly only; these two exist for recorded gifts.

alter type donation_frequency add value if not exists 'biweekly';
alter type donation_frequency add value if not exists 'irregular';
