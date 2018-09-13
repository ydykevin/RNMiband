/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
  AppRegistry
} from 'react-native';

import './shim.js';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
