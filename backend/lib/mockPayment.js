// lib/mockPayment.js
//
// A stand-in for a real payment gateway (Stripe/Razorpay/etc).
// Swap this module out for a real integration later — every route that
// calls it only relies on the { success, ref, reason } shape below, so
// nothing else needs to change.
//
// Test rules (so you can demo both outcomes):
//   - card ending in "0000"  -> declined
//   - upi id containing "fail" -> declined
//   - cod (cash on delivery) -> always "pending" (collected on delivery)
//   - anything else -> approved

function processPayment({ method, cardNumber, upiId }) {
  const ref = 'PAY-' + Math.random().toString(36).slice(2, 10).toUpperCase();

  if (method === 'cod') {
    return { success: true, status: 'pending', ref, reason: null };
  }

  if (method === 'card') {
    const digits = (cardNumber || '').replace(/\s/g, '');
    if (digits.endsWith('0000')) {
      return { success: false, status: 'failed', ref, reason: 'Card declined by issuing bank.' };
    }
    return { success: true, status: 'paid', ref, reason: null };
  }

  if (method === 'upi') {
    if ((upiId || '').toLowerCase().includes('fail')) {
      return { success: false, status: 'failed', ref, reason: 'UPI payment declined.' };
    }
    return { success: true, status: 'paid', ref, reason: null };
  }

  return { success: false, status: 'failed', ref, reason: 'Unknown payment method.' };
}

module.exports = { processPayment };
