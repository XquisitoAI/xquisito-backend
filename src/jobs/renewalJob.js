/**
 * Cron Job para Renovacion Automatica de Suscripciones
 *
 * Este job se ejecuta diariamente a las 6:00 AM (hora de Mexico)
 * y procesa todas las renovaciones de suscripciones pendientes.
 *
 * Funcionalidades:
 * - Enviar recordatorios 3 dias antes del vencimiento
 * - Procesar cobros automaticos el dia de vencimiento
 * - Aplicar downgrades programados
 * - Degradar inmediatamente a plan basico si el cobro falla (sin reintentos)
 */

const cron = require('node-cron');
const RenewalService = require('../services/main-portal/renewalService');

class RenewalJob {
    constructor() {
        this.renewalService = new RenewalService();
        this.isRunning = false;
    }

    /**
     * Inicia el cron job
     * Se ejecuta todos los dias a las 6:00 AM hora de Mexico (America/Mexico_City)
     */
    start() {
        console.log('🕐 Iniciando cron job de renovacion de suscripciones...');

        // Cron expression: minuto hora dia-del-mes mes dia-de-semana
        // '0 6 * * *' = todos los dias a las 6:00 AM
        const schedule = process.env.RENEWAL_CRON_SCHEDULE || '0 6 * * *';
        const timezone = process.env.RENEWAL_TIMEZONE || 'America/Mexico_City';

        this.job = cron.schedule(schedule, async () => {
            await this.runRenewalProcess();
        }, {
            scheduled: true,
            timezone: timezone
        });

        console.log(`✅ Cron job configurado: ${schedule} (${timezone})`);
        console.log('📅 Proximo ciclo se ejecutara a las 6:00 AM hora de Mexico');

        return this;
    }

    /**
     * Detiene el cron job
     */
    stop() {
        if (this.job) {
            this.job.stop();
            console.log('🛑 Cron job de renovacion detenido');
        }
    }

    /**
     * Ejecuta el proceso de renovacion manualmente
     * Util para testing o ejecucion manual desde API
     */
    async runRenewalProcess() {
        // Evitar ejecuciones concurrentes
        if (this.isRunning) {
            console.log('⚠️ El proceso de renovacion ya esta en ejecucion, saltando...');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();

        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔄 INICIO DEL PROCESO DE RENOVACION AUTOMATICA');
        console.log(`📅 Fecha: ${startTime.toISOString()}`);
        console.log('═══════════════════════════════════════════════════════');

        try {
            await this.renewalService.processAllRenewals();

            const endTime = new Date();
            const duration = (endTime - startTime) / 1000;

            console.log('═══════════════════════════════════════════════════════');
            console.log('✅ PROCESO DE RENOVACION COMPLETADO');
            console.log(`⏱️ Duracion: ${duration.toFixed(2)} segundos`);
            console.log('═══════════════════════════════════════════════════════');
            console.log('\n');

        } catch (error) {
            console.error('═══════════════════════════════════════════════════════');
            console.error('❌ ERROR EN PROCESO DE RENOVACION');
            console.error(`📛 Error: ${error.message}`);
            console.error('═══════════════════════════════════════════════════════');

            // Aqui podrias agregar notificacion a Slack/Discord/Email para alertar del error

        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Verifica el estado del job
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isScheduled: this.job ? true : false,
            nextRun: this.job ? 'Proximo dia a las 6:00 AM' : 'No programado'
        };
    }
}

// Crear instancia singleton
const renewalJob = new RenewalJob();

module.exports = renewalJob;
