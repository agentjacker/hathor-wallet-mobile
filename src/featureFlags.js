import events from 'events';
import { Platform } from 'react-native';
import { UnleashClient } from 'unleash-proxy-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UNLEASH_URL,
  UNLEASH_CLIENT_KEY,
  UNLEASH_POLLING_INTERVAL,
  WALLET_SERVICE_FEATURE_TOGGLE,
  STAGE,
} from './constants';

export const Events = {
  WALLET_SERVICE_ENABLED: 'wallet-service-enabled',
};

export class FeatureFlags extends events.EventEmitter {
  constructor(userId) {
    super();

    this.userId = userId;
    this.walletServiceFlag = WALLET_SERVICE_FEATURE_TOGGLE;
    this.walletServiceEnabled = null;
    this.client = new UnleashClient({
      url: UNLEASH_URL,
      clientKey: UNLEASH_CLIENT_KEY,
      refreshInterval: UNLEASH_POLLING_INTERVAL,
      appName: 'wallet-service-mobile',
    });

    this.client.on('update', () => {
      // Get current flag
      const walletServiceEnabled = this.client.isEnabled(this.walletServiceFlag);

      // We should only emit an update if we already had a value on the instance
      // and if the value has changed
      if (this.walletServiceEnabled !== null && (
        this.walletServiceEnabled !== walletServiceEnabled
      )) {
        this.walletServiceEnabled = walletServiceEnabled;
        this.emit('wallet-service-enabled', walletServiceEnabled);
      }
    });
  }

  /**
  * Uses the Hathor Unleash Server and Proxy to determine if the
  * wallet should use the WalletService facade or the old facade
  *
  * @return {boolean} The result from the unleash feature flag
  */
  async shouldUseWalletService() {
    try {
      const shouldIgnore = await AsyncStorage.getItem('featureFlags:ignoreWalletServiceFlag');
      if (shouldIgnore) {
        return false;
      }
      const options = {
        userId: this.userId,
        properties: {
          platform: Platform.OS,
          stage: STAGE,
        },
      };
      this.client.updateContext(options);

      // Start polling for feature flag updates
      await this.client.start();

      // start() method will have already called the fetchToggles, so the flag should be enabled
      const isWalletServiceEnabled = this.client.isEnabled(this.walletServiceFlag);
      this.walletServiceEnabled = isWalletServiceEnabled;

      return this.walletServiceEnabled;
    } catch (e) {
      // If our feature flag service is unavailable, we default to the
      // old facade
      return false;
    }
  }

  /**
   * Sets the ignore flag on the storage to persist it between app restarts
   */
  async ignoreWalletServiceFlag() {
    await AsyncStorage.setItem('featureFlags:ignoreWalletServiceFlag', 'true');
    this.walletServiceEnabled = false;

    // Stop the client from polling
    this.client.stop();
  }

  /**
   * Removes the ignore flag from the storage
   */
  static async clearIgnoreWalletServiceFlag() {
    await AsyncStorage.removeItem('featureFlags:ignoreWalletServiceFlag');
  }
}
