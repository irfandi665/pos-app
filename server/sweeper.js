'use strict';

const { db, withTransaction } = require('./db');
const { releaseExpiredReservations } = require('./services/reservations');
const { broadcastSse } = require('./services/qris-events');

let sweeperTimer = null;

async function sweepExpiredQris() {
  const expiredOrders = await withTransaction(() => releaseExpiredReservations(db));

  for (const expired of expiredOrders) {
    broadcastSse('qris_expired', {
      transaction_ref: expired.transaction_ref,
      order_id: expired.order_id,
      status: 'EXPIRED'
    });
  }

  return expiredOrders;
}

function startQrisExpirySweeper(intervalMs = 60_000) {
  if (sweeperTimer) return sweeperTimer;

  sweeperTimer = setInterval(() => {
    sweepExpiredQris().catch((error) => {
      console.error('QRIS expiry sweeper error:', error.message);
    });
  }, intervalMs);

  if (typeof sweeperTimer.unref === 'function') sweeperTimer.unref();
  return sweeperTimer;
}

function stopQrisExpirySweeper() {
  if (sweeperTimer) {
    clearInterval(sweeperTimer);
    sweeperTimer = null;
  }
}

module.exports = {
  sweepExpiredQris,
  startQrisExpirySweeper,
  stopQrisExpirySweeper
};
