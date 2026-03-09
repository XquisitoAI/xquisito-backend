## Descripción del cambio

<!-- Qué cambia y por qué -->

## Impacto de seguridad

<!-- ¿Este cambio afecta el flujo de pago, autenticación, o datos sensibles? -->

- [ ] Sí — describir:
- [x] No

## Checklist de seguridad PCI DSS

- [ ] No hay secrets hardcodeados
- [ ] Inputs validados en backend
- [ ] Queries parametrizadas (sin string concat en SQL)
- [ ] No se loguean datos de tarjeta (PAN, CVV, PIN)
- [ ] CSP actualizado si se agregaron nuevos scripts
- [ ] npm audit sin vulnerabilidades Critical o High
- [ ] No hay PANs reales en código de prueba
- [ ] Tests pasan en GitHub Actions
