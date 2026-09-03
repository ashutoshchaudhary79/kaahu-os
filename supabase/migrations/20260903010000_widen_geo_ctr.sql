drop view if exists v_state_channel_efficiency;

alter table channel_geo_spend
  alter column ctr type numeric(10,4);

create view v_state_channel_efficiency as
select
  geo_value as destination_state,
  platform,
  date,
  spend,
  impressions,
  link_clicks,
  ctr,
  cpm
from channel_geo_spend
where dimension = 'state';
