import { START_LOCATION, createRouter, createWebHistory } from 'vue-router'
import { metricBySlug } from './lib/metrics.js'
import { useSettings } from './composables/useSettings.js'
import { useDashboardView } from './composables/useDashboardView.js'
import Dashboard from './components/Dashboard.vue'
import MetricFullscreen from './components/MetricFullscreen.vue'
import CostFullscreen from './components/CostFullscreen.vue'
import DevicesView from './components/DevicesView.vue'
import SettingsLayout from './components/settings/SettingsLayout.vue'
import SettingsMenu from './components/settings/SettingsMenu.vue'
import DashboardSection from './components/settings/DashboardSection.vue'
import ThemeSection from './components/settings/ThemeSection.vue'
import WeatherSection from './components/settings/WeatherSection.vue'
import BatterySection from './components/settings/BatterySection.vue'
import AlertsSection from './components/settings/AlertsSection.vue'
import TariffSection from './components/settings/TariffSection.vue'
import GatewaySection from './components/settings/GatewaySection.vue'
import AppleHomeSection from './components/settings/AppleHomeSection.vue'
import GoogleHomeSection from './components/settings/GoogleHomeSection.vue'
import HistorySection from './components/settings/HistorySection.vue'
import SecuritySection from './components/settings/SecuritySection.vue'
import SystemSection from './components/settings/SystemSection.vue'
import SetupWizard from './components/SetupWizard.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/trends', name: 'trends', component: Dashboard },
    { path: '/cost', name: 'cost', component: CostFullscreen },
    { path: '/devices', name: 'devices', component: DevicesView },
    {
      path: '/metric/:slug',
      name: 'metric',
      component: MetricFullscreen,
      props: (route) => ({ metricKey: metricBySlug(route.params.slug)?.key }),
      beforeEnter: (to) => (metricBySlug(to.params.slug) ? true : { name: 'dashboard' })
    },
    {
      path: '/settings',
      component: SettingsLayout,
      children: [
        { path: '', name: 'settings', component: SettingsMenu },
        { path: 'dashboard', name: 'settings-dashboard', component: DashboardSection },
        { path: 'theme', name: 'settings-theme', component: ThemeSection },
        { path: 'weather', name: 'settings-weather', component: WeatherSection },
        { path: 'battery', name: 'settings-battery', component: BatterySection },
        { path: 'alerts', name: 'settings-alerts', component: AlertsSection },
        { path: 'tariff', name: 'settings-tariff', component: TariffSection },
        { path: 'gateway', name: 'settings-gateway', component: GatewaySection },
        { path: 'apple-home', name: 'settings-apple-home', component: AppleHomeSection },
        { path: 'google-home', name: 'settings-google-home', component: GoogleHomeSection },
        { path: 'history', name: 'settings-history', component: HistorySection },
        { path: 'security', name: 'settings-security', component: SecuritySection },
        { path: 'system', name: 'settings-system', component: SystemSection }
      ]
    },
    { path: '/setup', name: 'setup', component: SetupWizard },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } }
  ]
})

router.beforeEach(async (to, from) => {
  if (to.name === 'dashboard' && from === START_LOCATION && useDashboardView().view.trends) {
    return { name: 'trends', replace: true }
  }
  if (to.name !== 'dashboard' && to.name !== 'trends') return true
  return (await useSettings().shouldRunSetup()) ? { name: 'setup' } : true
})
