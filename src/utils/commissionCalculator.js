function getCommissionRates(amount) {
  if (amount >= 20 && amount <= 30) {
    return { xquisitoTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  } else if (amount >= 31 && amount <= 49) {
    return { xquisitoTotal: 8.0, clientPays: 6.0, restaurantPays: 2.0 };
  } else if (amount >= 50 && amount <= 100) {
    return { xquisitoTotal: 5.8, clientPays: 3.8, restaurantPays: 2.0 };
  } else if (amount >= 101 && amount <= 150) {
    return { xquisitoTotal: 4.2, clientPays: 2.2, restaurantPays: 2.0 };
  } else if (amount > 150) {
    return { xquisitoTotal: 4.0, clientPays: 2.0, restaurantPays: 2.0 };
  } else {
    return { xquisitoTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  }
}

function calculateCommissions(baseAmount, tipAmount) {
  const r2 = (n) => Math.round(n * 100) / 100;

  // Intermediarios sin redondear — idéntico al frontend
  const ivaTip = tipAmount * 0.16;
  const subtotalForCommission = baseAmount + tipAmount;
  const rates = getCommissionRates(subtotalForCommission);

  const xquisitoCommissionTotal = subtotalForCommission * (rates.xquisitoTotal / 100);
  const xquisitoCommissionClient = subtotalForCommission * (rates.clientPays / 100);
  const xquisitoCommissionRestaurant = subtotalForCommission * (rates.restaurantPays / 100);

  const ivaXquisitoClient = xquisitoCommissionClient * 0.16;
  const ivaXquisitoRestaurant = xquisitoCommissionRestaurant * 0.16;

  // Solo se redondean los valores finales, igual que el frontend
  const xquisitoClientCharge = r2(xquisitoCommissionClient + ivaXquisitoClient);
  const xquisitoRestaurantCharge = r2(xquisitoCommissionRestaurant + ivaXquisitoRestaurant);
  const totalAmountCharged = r2(baseAmount + tipAmount + xquisitoClientCharge);

  return {
    ivaTip,
    xquisitoCommissionTotal,
    xquisitoCommissionClient,
    xquisitoCommissionRestaurant,
    ivaXquisitoClient,
    ivaXquisitoRestaurant,
    xquisitoClientCharge,
    xquisitoRestaurantCharge,
    xquisitoRateApplied: rates.xquisitoTotal,
    totalAmountCharged,
  };
}

module.exports = { calculateCommissions, getCommissionRates };
