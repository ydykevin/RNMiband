import './shim.js';
import React, {Component} from 'react';
import {
  Platform, 
  StyleSheet, 
  Text, 
  View, 
  ListView,
  TouchableHighlight,
  ScrollView,
  PermissionsAndroid,
  AppState,
  NativeEventEmitter,
  NativeModules
} from 'react-native';
import RNMiband from './src/modules/RNMiband';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

export default class App extends Component {
  constructor(){
    super();

    this.state = {
      //scanning:false,
      peripherals: new Map(),
      appState: '',
      lastSyncMin: new Date()
    };

    this.handleDiscoverPeripheral = this.handleDiscoverPeripheral.bind(this);
    //this.handleStopScan = this.handleStopScan.bind(this);
    //this.handleUpdateValueForCharacteristic = this.handleUpdateValueForCharacteristic.bind(this);
    this.handleDisconnectedPeripheral = this.handleDisconnectedPeripheral.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);

    this.actData = [];
    this.connected = false;
    this.actData.push(['Time','Kind','Intensity','Step']);
    this.battery = '';
    
  }

  componentDidMount() {
    AppState.addEventListener('change', this.handleAppStateChange);

    RNMiband.start({showAlert: false});
    //BleManager.start({showAlert: false});

    this.handlerDiscover = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDiscoverPeripheral );
    //this.handlerStop = bleManagerEmitter.addListener('BleManagerStopScan', this.handleStopScan );
    this.handlerDisconnect = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnectedPeripheral );
    //this.handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', this.handleUpdateValueForCharacteristic );

    if (Platform.OS === 'android' && Platform.Version >= 23) {
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
            if (result) {
              console.log("Permission is OK");
            } else {
              PermissionsAndroid.requestPermission(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
                if (result) {
                  console.log("User accept");
                } else {
                  console.log("User refuse");
                }
              });
            }
      });
    }
  }

  componentWillUnmount() {
    this.handlerDiscover.remove();
    this.handlerStop.remove();
    this.handlerDisconnect.remove();
    RNMiband.handlerUpdate().remove();
    //this.handlerUpdate.remove();
  }

  handleDiscoverPeripheral(peripheral){
    var peripherals = this.state.peripherals;
    if (!peripherals.has(peripheral.id)){
      console.log('Got ble peripheral', peripheral);
      peripherals.set(peripheral.id, peripheral);
      this.setState({ peripherals })
    }
  }

  // handleStopScan() {
  //   console.log('Scan is stopped');
  //   this.setState({ scanning: false });
  // }

  

  handleDisconnectedPeripheral(data) {
    this.cleanData();
    let peripherals = this.state.peripherals;
    let peripheral = peripherals.get(data.peripheral);
    if (peripheral) {
      peripheral.connected = false;
      peripherals.set(peripheral.id, peripheral);
      this.setState({peripherals});
    }
    console.log('Disconnected from ' + data.peripheral);
  }

  handleAppStateChange(nextAppState) {
    if (this.state.appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App has come to the foreground!')
      RNMiband.getConnectedPeripherals([]).then((peripheralsArray) => {
        console.log('Connected peripherals: ' + peripheralsArray.length);
      });
    }
    this.setState({appState: nextAppState});
  }

  cleanData() {
    this.actData = [['Time','Kind','Intensity','Step']];
    this.battery = '';
    this.forceUpdate();
  }

  startScan() {
    this.cleanData();
    //if (!this.state.scanning) {
    this.setState({peripherals: new Map()});
    RNMiband.scan([], 3, true).then((results) => {
      console.log('Scanning...');
        //this.setState({scanning:true});
    });
    //}
  }

  retrieveConnected(){
    RNMiband.getConnectedPeripherals([]).then((results) => {
      console.log(results);
      var peripherals = this.state.peripherals;
      for (var i = 0; i < results.length; i++) {
        var peripheral = results[i];
        peripheral.connected = true;
        peripherals.set(peripheral.id, peripheral);
        this.setState({ peripherals });
      }
    });
  }

  connect(peripheral){
    RNMiband.connect(peripheral).then(()=>{
      this.connected = true;
      this.forceUpdate();
    });
  }

  disconnect(){
    RNMiband.disconnect().then(()=>{
      this.connected = false;
      this.forceUpdate();
    });
  }

  getBatteryLevel(){
    RNMiband.getBatteryLevel().then((data)=>{
      this.battery = data;
      console.log('app battery: '+this.battery);
      this.forceUpdate();
    }); 
  }

  getActivityData(){

    var time    = new Date();
    //var hour    = time.getHours();
    //var minute  = time.getMinutes();
    var hour    = 17;
    var minute  = 30;
    time.setHours(hour);
    time.setMinutes(minute);


    // RNMiband.getActivityData(time);
    // this.actData = [];
    // this.actData.push(['Time','Kind','Intensity','Step']);
    // setInterval(()=>{
    //   this.actData = RNMiband.actData;
    //   this.forceUpdate();
    // },1000);

    RNMiband.getActivityData(time).then((actData)=>{
      this.actData = actData;
      this.actData.unshift(['Time','Kind','Intensity','Step']);
      this.forceUpdate();
    });
  }

  getActivityDataRange(startDate,endDate){

    var startDate  = new Date();
    var startHour    = 17;
    var startMinute  = 30;
    startDate.setHours(startHour);
    startDate.setMinutes(startMinute);

    var endDate  = new Date();
    var endHour    = 17;
    var endMinute  = 40;
    endDate.setHours(endHour);
    endDate.setMinutes(endMinute);


    RNMiband.getActivityDataRange(startDate,endDate).then((actData)=>{
      this.actData = actData;
      this.actData.unshift(['Time','Kind','Intensity','Step']);
      this.forceUpdate();
    });
  }

  render() {
    const list = Array.from(this.state.peripherals.values());
    const dataSource = ds.cloneWithRows(list);

    return (
      <View style={styles.container}>
        <TouchableHighlight style={{marginTop: 30,margin: 20, padding:10, backgroundColor:'#ccc'}} onPress={() => this.startScan() }>
          <Text>Scan Bluetooth</Text>
        </TouchableHighlight>
        <TouchableHighlight style={{marginTop: 0,margin: 20, padding:10, backgroundColor:'#ccc'}} onPress={() => this.disconnect() }>
          <Text>Disconnect</Text>
        </TouchableHighlight>
        {/* <TouchableHighlight style={{marginTop: 0,margin: 20, padding:10, backgroundColor:'#ccc'}} onPress={() => this.retrieveConnected() }>
          <Text>Retrieve connected peripherals</Text>
        </TouchableHighlight> */}
        <ScrollView style={styles.scroll}>
          {(list.length == 0) &&
            <View style={{flex:1, margin: 20}}>
              <Text style={{textAlign: 'center'}}>No peripherals</Text>
            </View>
          }
          <ListView
            enableEmptySections={true}
            dataSource={dataSource}
            renderRow={(item) => {
              const color = item.connected ? 'green' : '#fff';
              return (
                <TouchableHighlight onPress={() => this.connect(item) }>
                  <View style={[styles.row, {backgroundColor: color}]}>
                    <Text style={{fontSize: 12, textAlign: 'center', color: '#333333', padding: 10}}>{item.name}</Text>
                    <Text style={{fontSize: 8, textAlign: 'center', color: '#333333', padding: 10}}>{item.id}</Text>
                  </View>
                </TouchableHighlight>
              );
            }}
          />
        </ScrollView>
        <ScrollView style={styles.scroll}>
          <ScrollView  horizontal = {true} showsHorizontalScrollIndicator= {false}>
            <View>
              {
                this.actData.map((eachRow,j) => {
                  return (
                    <View style={{flexDirection:'row'}} key = {j}>
                      {
                        eachRow.map((eachItem,i) => {
                          return <View key = {i} style={{width:i==0?150:70,height:40,backgroundColor:((j%2)?'white':'#ccc'),alignItems:'center',justifyContent:'center'}}><Text>{eachItem}</Text></View>
                        })
                      }
                    </View>
                  );
                })
              }
            </View>
          </ScrollView>
        </ScrollView>
        <View style={{height:50, flexDirection: 'row'}}>
          <TouchableHighlight style={{marginTop: 0,margin: 10, padding:10, backgroundColor:'#ccc'}} onPress={() => this.getBatteryLevel() }>
            <Text>Battery Level</Text>
          </TouchableHighlight>
          <TouchableHighlight style={{marginTop: 0,margin: 10, padding:10, backgroundColor:'#ccc'}} onPress={() => this.getActivityData() }>
            <Text>Act Data</Text>
          </TouchableHighlight>
          <TouchableHighlight style={{marginTop: 0,margin: 10, padding:10, backgroundColor:'#ccc'}} onPress={() => this.getActivityDataRange() }>
            <Text>Range Data</Text>
          </TouchableHighlight>
        </View>
        <View style={{height:20,margin:10}}><Text>Battery: {this.battery} Connection: {this.connected?'Connected':'Not connected'}</Text></View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    width: window.width,
    height: window.height
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    margin: 10,
  },
  row: {
    margin: 10
  },
});