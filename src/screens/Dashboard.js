import React from "react";
import {
  AppState,
  StyleSheet,
  View,
} from "react-native";
import { connect } from 'react-redux';

import * as Keychain from 'react-native-keychain';

import HathorHeader from '../components/HathorHeader';
import TokenSelect from '../components/TokenSelect';
import SimpleButton from '../components/SimpleButton';

import { activateFetchHistory, newTx, resetData, setTokens, updateSelectedToken, setIsOnline, lockScreen } from '../actions';
import { setSupportedBiometry } from '../utils';
import OfflineBar from '../components/OfflineBar';
import { LOCK_TIMEOUT } from '../constants';

import hathorLib from '@hathor/wallet-lib';

/**
 * tokens {Array} array with all added tokens on this wallet
 * tokensBalance {Object} dict with balance for each token
 * selectedToken {Object} token currently selected by the user
 * screenLocked {bool} whether the screen is locked
 */
const mapStateToProps = (state) => ({
  tokens: state.tokens,
  tokensBalance: state.tokensBalance,
  selectedToken: state.selectedToken,
  screenLocked: state.lockScreen,
})

const mapDispatchToProps = dispatch => {
  return {
    resetData: () => dispatch(resetData()),
    setTokens: (tokens) => dispatch(setTokens(tokens)),
    newTx: (newElement, keys) => dispatch(newTx(newElement, keys)),
    updateSelectedToken: token => dispatch(updateSelectedToken(token)),
    setIsOnline: (status) => dispatch(setIsOnline(status)),
    lockScreen: () => dispatch(lockScreen()),
    activateFetchHistory: () => dispatch(activateFetchHistory()),
  }
}

class Dashboard extends React.Component {
  static navigatorStyle = { tabBarVisible: false }

  backgroundTime = null;
  appState = 'active';

  componentDidMount() {
    this.getBiometry();
    hathorLib.WebSocketHandler.on('wallet', this.handleWebsocketMsg);
    hathorLib.WebSocketHandler.on('reload_data', this.props.activateFetchHistory);
    hathorLib.WebSocketHandler.on('is_online', this.isOnlineUpdated);
    AppState.addEventListener('change', this._handleAppStateChange);
    // We need to update the redux tokens with data from localStorage, so the user doesn't have to add the tokens again
    this.updateReduxTokens();
  }

  componentWillUnmount() {
    hathorLib.WebSocketHandler.removeListener('wallet', this.handleWebsocketMsg);
    hathorLib.WebSocketHandler.removeListener('reload_data', this.props.activateFetchHistory);
    hathorLib.WebSocketHandler.removeListener('is_online', this.isOnlineUpdated);
    AppState.removeEventListener('change', this._handleAppStateChange);
    this.props.resetData();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.screenLocked && !this.props.screenLocked) {
      this.backgroundTime = null;
    }
  }

  isOnlineUpdated = (value) => {
    this.props.setIsOnline(value);
  }

  getBiometry = () => {
    Keychain.getSupportedBiometryType().then(biometryType => {
      switch (biometryType) {
        case Keychain.BIOMETRY_TYPE.TOUCH_ID:
          setSupportedBiometry(biometryType);
          break;
        default:
          setSupportedBiometry(null);
        // XXX Android Fingerprint is still not supported in the react native lib we're using.
        // https://github.com/oblador/react-native-keychain/pull/195
        //case Keychain.BIOMETRY_TYPE.FINGERPRINT:
        // XXX iOS FaceID also not working
        //case Keychain.BIOMETRY_TYPE.FACE_ID:
      }
    });
  }

  _handleAppStateChange = (nextAppState) => {
    if (nextAppState === 'active') {
      if (this.appState === 'inactive') {
        // inactive state means the app wasn't in background, so no need to lock
        // the screen. This happens when user goes to app switch view or maybe is
        // asked for fingerprint or face if
        this.backgroundTime = null;
      } else if (Date.now() - this.backgroundTime > LOCK_TIMEOUT) {
        // this means app was in background for more than LOCK_TIMEOUT seconds,
        // so display lock screen
        this.props.lockScreen();
      } else {
        this.backgroundTime = null;
      }
    } else if (this.backgroundTime === null) {
      // app is leaving active state. Save timestamp to check if we need to lock
      // screen when it becomes active again
      this.backgroundTime = Date.now();
    }
    this.appState = nextAppState;
  }

  updateReduxTokens = () => {
    this.props.setTokens(hathorLib.tokens.getTokens());
  }

  handleWebsocketMsg = wsData => {
    if (wsData.type === "wallet:address_history") {
      //TODO we also have to update some wallet lib data? Lib should do it by itself
      const walletData = hathorLib.wallet.getWalletData();
      const historyTransactions = 'historyTransactions' in walletData ? walletData['historyTransactions'] : {};
      const allTokens = 'allTokens' in walletData ? walletData['allTokens'] : [];
      hathorLib.wallet.updateHistoryData(historyTransactions, allTokens, [wsData.history], null, walletData)
      
      const newWalletData = hathorLib.wallet.getWalletData();
      const keys = newWalletData.keys;
      this.props.newTx(wsData.history, keys);
    }
  }

  onItemPress = (item) => {
    this.props.updateSelectedToken(item);
    this.props.navigation.navigate('MainScreen');
  }

  render() {
    const ManualInfoButton = () => (
      <SimpleButton 
        title='Register token'
        onPress={() => this.props.navigation.navigate('RegisterToken')}
      />
    )

    const Header = () => (
      <HathorHeader
        title='TOKENS'
        wrapperStyle={{ borderBottomWidth: 0 }}
        rightElement={<ManualInfoButton/>}
      />
    )

    return (
      <View style={{flex: 1}}>
        <TokenSelect
          header=<Header/>
          renderArrow={true}
          onItemPress={this.onItemPress}
          selectedToken={this.props.selectedToken}
          tokens={this.props.tokens}
          tokensBalance={this.props.tokensBalance}
        />
        <OfflineBar />
      </View>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboard);
