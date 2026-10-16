#!/bin/sh
# Trade shapes on the training drafts against the real 2018-2023 average (tuning helper).
# tools/trade_shape.sh MODEL SIMS [--set ...]
M=$1; N=$2; shift 2
for Y in 2020 2023; do
  node tools/backtest.mjs --years $Y --model $M --sims $N --offer-seeds 0 --quiet "$@" | tail -1
done | python3 -c "
import json,sys
rows=[json.loads(l) for l in sys.stdin if l.strip()]
keys=['r1','r2','r3','r4_7','all','future','player','downAdds','slots_median','slots_p90','price_median','price_p10','price_p90']
real={'r1':5.83,'r2':7.5,'r3':6.5,'r4_7':15.83,'all':36,'future':7.83,'player':2.67,'downAdds':7.83,'slots_median':9,'slots_p90':29.1,'price_median':1.003,'price_p10':0.912,'price_p90':1.144}
avg={k:round(sum(r['t'][k] or 0 for r in rows)/len(rows),2) for k in keys}
print('AI  ', avg); print('real', real)
print('R1 hits/team/huddle', [ (r['y'], r['r1']['hits'], r['r1']['team'], r['r1']['huddle']) for r in rows], 'ranges', [r['rng'] for r in rows])
"
