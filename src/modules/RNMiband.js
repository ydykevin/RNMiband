import React, { Component } from 'react';
import '../../shim.js';
import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  NativeAppEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  PermissionsAndroid,
  ListView,
  ScrollView,
  AppState,
  Dimensions,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { Buffer } from 'buffer';
import crypto from 'react-native-crypto';
//import textDecoder from 'text-encoding';

const window = Dimensions.get('window');
//const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const UUID_BASE       = (x) => `0000${x}-0000-3512-2118-0009AF100700`;
//const UUID_BASE_ALERT = (x) => `0000${x}-0000-1000-8000-00805f9b34fb`;
const miband_service    = 'FEE0';
const miband2_service   = 'FEE1';
const alert_service_1   = '1811';
const alert_service_2   = '1802';
const act       = UUID_BASE('0004');
const act_data  = UUID_BASE('0005');
const batt      = UUID_BASE('0006');
const step_data = UUID_BASE('0007');
const auth      = UUID_BASE('0009');
const alert1    = `2A46`;
const alert2    = `2A06`;

const AB = function() {
  var args = [...arguments];
  
  // Convert all arrays to buffers
  args = args.map(function(i) {
    if (i instanceof Array) {
      return Buffer.from(i);
    }
    return i;
  })
  
  // Merge into a single buffer
  var buf = Buffer.concat(args);

  // Convert into ArrayBuffer
  var ab = new ArrayBuffer(buf.length);
  var view = new Array(ab);

  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }

  console.log('view: '+view+' length: '+view.length);
  return view;
}

class RNMiband{
  constructor(){

    this.peripherals = new Map();

    this.handleUpdateValueForCharacteristic = this.handleUpdateValueForCharacteristic.bind(this);

    this.key = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
    this.actData = [];
    this.connected = false;
    this.finalTime;
    this.endDate;
    this.lastSyncMin;
    this.actDataDone = false;
    this.finding = false;

    console.log('RNMiband con done');
  }

  start(options){
    BleManager.start(options);
    this.handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', this.handleUpdateValueForCharacteristic );
  }

  scan(serviceUUIDs, seconds, allowDuplicates, scanningOptions={}){
    return new Promise((fulfill, reject) => {
      BleManager.scan(serviceUUIDs, seconds, allowDuplicates, scanningOptions, (error) => {
        if (error) {
          reject(error);
        } else {
          fulfill();
        }
      });
    });
  }

  getConnectedPeripherals(serviceUUIDs) {
    return new Promise((fulfill, reject) => {
      BleManager.getConnectedPeripherals(serviceUUIDs, (error, result) => {
        if (error) {
          reject(error);
        } else {
          if (result != null) {
            fulfill(result);
          } else {
            fulfill([]);
          }
        }
      });
    });
  }

  handleUpdateValueForCharacteristic(data) {
    console.log('Data Update at: ' + data.peripheral + ' characteristic: ' + data.characteristic + ' data: '+ data.value);
    
    //Authentication
    if(data.characteristic.toUpperCase() === auth){
      var cmd = Buffer.from(data.value).slice(0,3).toString('hex');
      var peripheral = data.peripheral;
      if (cmd === '100101') {         
        console.log('Set New Key OK');
        //this.sendWithoutNotification(peripheral,miband2_service,auth,[0x02,0x08]);
        BleManager.writeWithoutResponse(peripheral,miband2_service,auth,[0x02,0x08]);
      } else if (cmd === '100201') {
        console.log('Req Random Number OK');

        var rdn = Buffer.from(data.value).slice(3,19);
        console.log('random number: '+ rdn);
        var cipher = crypto.createCipheriv('aes-128-ecb', this.key, '').setAutoPadding(false);
        var encrypted = Buffer.concat([cipher.update(rdn), cipher.final()]);
        console.log('encrypted: '+encrypted+' length: '+encrypted.length);

        //this.sendWithoutNotification(peripheral,miband2_service,auth,AB([0x03,0x08],encrypted));
        BleManager.writeWithoutResponse(peripheral,miband2_service,auth,AB([0x03,0x08],encrypted));
      } else if (cmd === '100301') {
        console.log('Authenticated');
        this.connected = true;
      } else if (cmd === '100104') {
        console.log('Set New Key FAIL');
      } else if (cmd === '100204') {
        console.log('Req Random Number FAIL')
      } else if (cmd === '100304') {
        console.log('Encryption Key Auth Fail, should send new key...');
        var data = [0x01,0x08,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
        BleManager.writeWithoutResponse(peripheral, miband2_service, auth, data).then(() => {
          console.log('writing: '+data);
        }).catch((error)=>{
          console.log('Writing error', error);
        });
      }
    } else if (data.characteristic.toUpperCase() === act_data){
      this.updateActData(data);
    } else if (data.characteristic.toUpperCase() === act) {
      var cmd = Buffer.from(data.value).slice(0,3).toString('hex');
      if (cmd === '100201') {
        this.actDataDone = true;
      }
    }
  
  }

  handleStopScan() {
    console.log('Scan is stopped');
    this.scanning = false ;
  }

  startScan() {
    //this.cleanData();
    if (!this.scanning) {
      this.peripherals = new Map();
      BleManager.scan([], 3, true).then((results) => {
        console.log('Scanning...');
        this.scanning = true;
      });
    }
  }

  retrieveConnected(){
    BleManager.getConnectedPeripherals([]).then((results) => {
      console.log(results);
      var peripherals = this.peripherals;
      for (var i = 0; i < results.length; i++) {
        var peripheral = results[i];
        peripheral.connected = true;
        peripherals.set(peripheral.id, peripheral);
        this.peripherals = peripherals;
      }
    });
  }

  handleDiscoverPeripheral(peripheral){
    var peripherals = this.peripherals;
    if (!peripherals.has(peripheral.id)){
      console.log('Got ble peripheral', peripheral);
      peripherals.set(peripheral.id, peripheral);
      this.peripherals = peripherals;
    }
  }

  connect(peripheral){
    BleManager.connect(peripheral.id).then(() => {
      console.log('Connected to ' + peripheral.id);
      this.peripheral = peripheral.id;
      setTimeout(() => {
        BleManager.retrieveServices(peripheral.id).then(() => {
          setTimeout(() => {
            BleManager.startNotification(peripheral.id, miband2_service, auth);//.then(() => {
              console.log('Started notification on ' + peripheral.id);
              setTimeout(() => {
                //var data = [0x01,0x08,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
                var data = [0x02,0x08];
                BleManager.writeWithoutResponse(peripheral.id, miband2_service, auth, data).then(() => {
                  console.log('writing: '+data);
                }).catch((error)=>{
                  console.log('Writing error', error);
                });
              },500);
          }, 200);
        });
      },900);
    }).catch((error) => {
      console.log('Connection error', error);
    });

    return new Promise((fulfill, reject) => {
      var waitForConnect = setInterval(()=>{
        if(this.connected){
          fulfill();
          clearInterval(waitForConnect);
        }
        console.log('waitforconnect interval');
      },1000);
    });

  }
  
  disconnect(){
    if(!this.peripheral){
      return new Promise((fulfill, reject)=>{
        fulfill();
      });
    }else{
      BleManager.disconnect(this.peripheral).then(()=>{
        this.connected = false;
        console.log('Disconnected from ' + this.peripheral);
      });
    }
    return new Promise((fulfill, reject) => {
      var waitForDisconnect = setInterval(()=>{
        if(!this.connected){
          fulfill();
          clearInterval(waitForDisconnect);
        }
      },1000);
    });
  }

  getBatteryLevel(){
    return new Promise((fulfill, reject) => {
      if(!this.peripheral){
        reject('No device connected.');
      } else {
        BleManager.read(this.peripheral,miband_service,batt).then((data)=>{
          var battery = data[1]+'%';
          fulfill(battery);
        });
      }
    });
  }

  getStepData(){
    return new Promise((fulfill, reject) => {
      if (!this.peripheral) {
        reject('No device connected.');
      } else {
        BleManager.read(this.peripheral,miband_service,step_data).then((data)=>{
          var buffer = Buffer.from(data);
          var stepData = [];
          stepData.push(buffer.readUInt16LE(1));
          stepData.push(buffer.readUInt32LE(5));
          stepData.push(buffer.readUInt32LE(9));
          //console.log('Step: '+step+' distance: '+distance+' calories: '+calories);
          fulfill(stepData);
        });
      }
    });
  }

  findDevice(){
    if (!this.peripheral) {
      return;
    } else {
      this.finding = true;
      this.doFindDevice();
      var findingDevice = setInterval(()=>{
        if(!this.finding){
          clearInterval(findingDevice);
        }
        BleManager.writeWithoutResponse(this.peripheral, alert_service_1, alert1, [0x05,0x01,0x59,0x6f,0x75,0x20,0x66,0x6f,0x75,0x6e,0x64,0x20,0x69,0x74,0x21]).then(() => {
        }).catch((error)=>{
          console.log('Writing error', error);
        });
        this.doFindDevice();
      },5000);
    }
  }

  foundDevice(){
    this.finding = false;
  }

  doFindDevice(){
    BleManager.retrieveServices(this.peripheral).then(() => {
      BleManager.writeWithoutResponse(this.peripheral, alert_service_1, alert1, [0x05,0x01]).then(() => {
        BleManager.writeWithoutResponse(this.peripheral, alert_service_2, alert2, [0xff,0x2c,0x01,0x58,0x02,0x03]).then(() => {
        }).catch((error)=>{
          console.log('Writing error', error);
        });
      }).catch((error)=>{
        console.log('Writing error', error);
      });
    });
  }

  updateActData(data){
    for(var i = 1; i < data.value.length; i+=4){
      var time    = this.lastSyncMin;
      if(this.hasEndDate&&time.getTime()+1000>=this.endDate.getTime()){
        return;
      }     
      var year    = time.getFullYear();
      var month   = (time.getMonth()+1)<10?'0'+(time.getMonth()+1):(time.getMonth()+1);
      var date    = time.getDate()<10?'0'+time.getDate():time.getDate();
      var hour    = time.getHours()<10?'0'+time.getHours():time.getHours();
      var minute  = time.getMinutes()<10?'0'+time.getMinutes():time.getMinutes();
      var timeToPrint = date + '/' + month + '/' + year + ' ' + hour + ':' + minute; 
      //this.actData.push([timeToPrint,kind,intensity,step,heartRate]);
      var kind      = data.value[i] & 0xff;
      var intensity = data.value[i+1] & 0xff;
      var step      = data.value[i+2] & 0xff;
      var heartRate = data.value[i+3] & 0xff;
      console.log('Kind: '+ kind +' Intensity: '+ intensity +' Step: '+ step +' Heart Rate: '+ heartRate);
 
      if(kind==0x01||kind==0x11||kind==0x41||kind==0x51||kind==0x01){
        kind = 'Walk';
      }else if(kind==0x12||kind==0x42||kind==0x52||kind==0x62){
        kind = 'Run';
      }else if(kind==0x19){
        kind = 'Lie Down';
      }else if(kind==0x1c||kind==0x5c||kind==0x6c||kind==0x7c){
        kind = 'Get Up';
      }else if(kind==0x21){
        kind = 'Walk Up';
      }else if(kind==0x22){
        kind = 'Run Up';
      }else if(kind==0x31){
        kind = 'Walk Down';
      }else if(kind==0x32){
        kind = 'Run Down';
      }else if(kind==0x53||kind==0x63||kind==0x73||((kind==0x70&&intensity==0))){
        kind = 'Not Worn';
      }else if(kind==0x79||(kind==0x70&&intensity>0)){
        kind = 'Sleep';
      }else if(kind==0x5a||kind==0x59||kind==0x50){
        kind = 'Sit';
      }else if(kind==0x60||0x6a){
        kind = 'Stand';
      }else{
        kind = 'Type '+kind;
      }

      this.actData.push([timeToPrint,kind,intensity,step]);
      var newLastSyncMin = new Date(this.lastSyncMin.getTime() + 60 * 1000);
      this.lastSyncMin = newLastSyncMin;
    }
  }

  doGetActivityData(startDate){
    
    this.finalTime = new Date();
    var head = [0x01,0x01];
    //var tail = [0x00,0x28]; // timezone * 4, Sydney = 10 * 4 for no DST
    var tail = [0x00,0x2c]; // timezone * 4, Sydney = 10 * 4 + 4 DST
    var time = startDate;
    var year    = time.getFullYear();
    var month   = time.getMonth() + 1;
    var date    = time.getDate();
    var hour    = time.getHours();
    var minute  = time.getMinutes();

    this.lastSyncMin = time;

    console.log('time: '+time+' year: '+year+' month: '+month+' date: '+date+' hour: '+hour+' minute: '+minute);

    var yearByte = [ year & 0xff, (year >> 8) & 0xff];
    
    var arr = AB(head,yearByte,[month],[date],[hour],[minute],tail);
    console.log('arr: '+arr);

    setTimeout(()=>{
      BleManager.retrieveServices(this.peripheral).then(() => {
        setTimeout(()=>{
          BleManager.startNotification(this.peripheral, miband_service, act);//.then(() => {
            setTimeout(()=>{
              BleManager.writeWithoutResponse(this.peripheral, miband_service, act, arr).then(() => {
                setTimeout(()=>{
                  BleManager.retrieveServices(this.peripheral).then(() => {
                    setTimeout(()=>{
                      BleManager.startNotification(this.peripheral,miband_service,act_data);//.then(()=>{
                        setTimeout(() => {
                          BleManager.writeWithoutResponse(this.peripheral,miband_service,act,[0x02]);
                        },500);
                    },200);
                  });
                },900);
              });
            },500);
        },200);
      });
    },900);

    this.actData = [];
  }

  getActivityData(startDate){
    
    this.hasEndDate = false;
    if(!this.peripheral){
      reject('No device connected.');
    } else {
      this.doGetActivityData(startDate);
    }

    return new Promise((fulfill, reject) => {
      var waitForActData = setInterval(()=>{
        // if(this.lastSyncMin.getTime()+2000>=this.finalTime.getTime()){
        //   fulfill(this.actData);
        //   clearInterval(waitForActData);
        // }
        if(this.actDataDone){
          this.actDataDone = false;
          clearInterval(waitForActData);
          fulfill(this.actData);
        }
      },1000);
    });
  }

  getActivityDataRange(startDate,endDate){

    this.hasEndDate = true;
    if(!this.peripheral){
      reject('No device connected.');
    } else {
      this.endDate = endDate;
      this.doGetActivityData(startDate);
    }

    return new Promise((fulfill, reject) => {
      var waitForActDataRange = setInterval(()=>{
        // if(this.lastSyncMin.getTime()+1000>=endDate.getTime()){
        //   fulfill(this.actData);
        //   clearInterval(waitForActDataRange);
        // }
        if(this.actDataDone){
          this.actDataDone = false;
          clearInterval(waitForActDataRange);
          fulfill(this.actData);
        }
      },1000);
    });

  }

}

module.exports = new RNMiband();