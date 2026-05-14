function getCommissionRates(amount) {
  if (amount >= 20 && amount <= 30) {
    return { evenTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  } else if (amount >= 31 && amount <= 49) {
    return { evenTotal: 8.0, clientPays: 6.0, restaurantPays: 2.0 };
  } else if (amount >= 50 && amount <= 100) {
    return { evenTotal: 5.8, clientPays: 3.8, restaurantPays: 2.0 };
  } else if (amount >= 101 && amount <= 150) {
    return { evenTotal: 4.2, clientPays: 2.2, restaurantPays: 2.0 };
  } else if (amount > 150) {
    return { evenTotal: 4.0, clientPays: 2.0, restaurantPays: 2.0 };
  } else {
    return { evenTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  }
}

function calculateCommissions(baseAmount, tipAmount) {
  const r2 = (n) => Math.round(n * 100) / 100;

  // Intermediarios sin redondear — idéntico al frontend
  const ivaTip = tipAmount * 0.16;
  const subtotalForCommission = baseAmount + tipAmount;
  const rates = getCommissionRates(subtotalForCommission);

  const evenCommissionTotal = subtotalForCommission * (rates.evenTotal / 100);
  const evenCommissionClient = subtotalForCommission * (rates.clientPays / 100);
  const evenCommissionRestaurant =
    subtotalForCommission * (rates.restaurantPays / 100);

  const ivaEvenClient = evenCommissionClient * 0.16;
  const ivaEvenRestaurant = evenCommissionRestaurant * 0.16;

  // Solo se redondean los valores finales, igual que el frontend
  const evenClientCharge = r2(evenCommissionClient + ivaEvenClient);
  const evenRestaurantCharge = r2(evenCommissionRestaurant + ivaEvenRestaurant);
  const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);

  return {
    ivaTip,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    evenRateApplied: rates.evenTotal,
    totalAmountCharged,
  };
}

module.exports = { calculateCommissions, getCommissionRates };
