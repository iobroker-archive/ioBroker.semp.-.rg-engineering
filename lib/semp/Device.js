
/*

admin

DeviceIsActive						devices[id].IsActive
DeviceID 							devices[id].ID
DeviceVendor						devices[id].Vendor
DeviceName							devices[id].Name
DeviceType							devices[id].Type
DeviceSerialnumber					devices[id].SerialNr
DeviceMaxPower						devices[id].MaxPower
DeviceMinPower						devices[id].MinPower
DeviceInterruptionAllowed			devices[id].InterruptionsAllowed
DeviceMinOnTime						devices[id].MinOnTime
DeviceMaxOnTime						devices[id].MaxOnTime
DeviceMinOffTime					devices[id].MinOffTime
DeviceMaxOffTime					devices[id].MaxOffTime
DeviceMeasurementMethod				devices[id].MeasurementMethod
DeviceOIDPower						devices[id].OID_Power
DeviceStatusDetectionType			devices[id].StatusDetection
DeviceOIDStatus						devices[id].OID_Status
DeviceHasOIDSwitch					devices[id].HasOIDSwitch
DeviceOIDSwitch						devices[id].OID_Switch
DeviceTimerActive					devices[id].TimerActive
DeviceMeasurementUnit				devices[id].MeasurementUnit


DeviceStatusDetectionLimit          devices[id].StatusDetectionLimit
DeviceStatusDetectionLimitTimeOn    devices[id].StatusDetectionLimitTimeOn
DeviceStatusDetectionLimitTimeOff   devices[id].StatusDetectionLimitTimeOff
DeviceStatusDetectionMinRunTime     devices[id].StatusDetectionMinRunTime



//cancel request: see issue #14
DeviceTimerCancelIfNotOn            devices[id].TimerCancelIfNotOn
DeviceTimerCancelIfNotOnTime        devices[id].TimerCancelIfNotOnTime

//energy request list
table EnergyRequestPeriods          devices[id].EnergyRequestPeriods
    -> ID
    -> Days
    -> EarliestStartTime
    -> LatestEndTime
    -> MinRunTime
    -> MaxRunTime

//wallbox
DeviceBatteryCapacity               devices[id].BatteryCapacity

DeviceDeviceWallboxPhases       devices[id].DeviceWallboxPhases

alt:
DeviceOIDPlugConnected              devices[id].OID_PlugConnected
DeviceOIDIsCharging                 devices[id].OID_IsCharging
DeviceOIDIsError                    devices[id].OID_IsError
DeviceOIDChargePower                devices[id].OID_ChargePower
DeviceOIDStartCharge                devices[id].OID_StartCharge
DeviceOIDStopCharge                 devices[id].OID_StopCharge

neu:
                                    devices[id].WallboxOIDs[]
                                    with
                                    * active
                                    * must
                                    * Name
                                        * DeviceOIDPlugConnected
                                        * DeviceOIDIsCharging
                                        * DeviceOIDIsError
                                        * DeviceOIDChargePower
                                        * DeviceOIDStartCharge
                                        * DeviceOIDStopCharge
                                        * DeviceOID3PhaseChargeEnable
                                        * DeviceOID3PhaseChargeDisable
                                    * OID
                                    * Type
                                    * SetValue

*/


/*
todo
* request canceln, wenn gerät   schon wieder aus
 * currentOnTime speichern und bei adapterstart holen
 *
 *

                                    State "semp.0.Devices.Trockner.State" has no existing object, this might lead to an error in future versions
	2022-12-24 09:05:55.141	warn	State "semp.0.Devices.Aquarium.State" has no existing object, this might lead to an error in future versions
	2022-12-24 09:05:55.140	warn	State "semp.0.Devices.Waschmaschine.State" has no existing object, this might lead to an error in future versions
	2022-12-24 09:05:55.139	warn	State "semp.0.Devices.Trockner.State" has no existing object, this might lead to an error in future versions
	2022-12-24 09:05:55.138	warn	State "semp.0.Devices.Aquarium.State" has no existing object, this might lead to an error in future versions
	2022-12-24 09:05:55.137	warn	State "semp.0.Devices.Waschmaschine.State" has no existing object, this might lead to an error in future versions

*/


const { Planningrequest } = require("./Planningrequest");



class Device {


	/**
	 * Creates new device
	 */

	constructor(gateway,
		device,
		logger) {

		this.states = {
			waiting: "waiting",
			waiting4On: "waiting for on",
			on: "on",
			//wallbox
			plugNotConnected: "plug not connected",
			plugConnected: "plug connected",
			startCharge: "charge starting",
			charging: "charging",
			fastCharging: "fast charging",
			stopCharge: "charge stopping",
			//dishwasher
			off: "off",
			TimeframeOn: "Timeframe On",
			FinishedWaiting4TF: "FinishedWaiting4TF",
			TFendedWaiting4Device: "TFendedWaiting4Device",
			TFended: "TFended",
			DeviceFinished: "DeviceFinished",
			DeviceInStandby:"DeviceInStandby"



		};

		this.Gateway = gateway;
		this.device = device;

		this.deviceInfo = null;
		this.deviceStatus = null;
		this.EnergyData = {
			lastTimestamp: -99,
			SumEnergy: 0
		};

		this.logger = logger;

		const planningrequestsSettings = {
			EnergyRequestPeriods: this.device.EnergyRequestPeriods,
			SwitchOffAtEndOfTimer: this.device.SwitchOffAtEndOfTimer,
			DeviceName: this.device.Name,
			DeviceType: this.device.Type,
			MaxEnergy: this.device.BatteryCapacity,
			MinEnergy: 0.1 * this.device.BatteryCapacity,
			MinPower: this.device.MinPower,
			MaxPower: this.device.MaxPower,
			WallboxChargeTime: this.device.WallboxChargeTime,
			DishWasherMode: (this.device.Type == "DishWasher") ? true : false
		};

		this.planningrequest = null;

		if (this.device.TimerActive || this.device.Type == "EVCharger") {
			this.planningrequest = new Planningrequest(planningrequestsSettings, this.Gateway.parentAdapter);
		}

		this.lastRecommendation;

		if (this.device.ID === undefined || this.device.ID.length < 25) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong device id " + this.device.ID + "! must follow F-xxxxxxxx-yyyyyyyyyyyy-zz");
		}

		this.Gateway.parentAdapter.log.debug(this.device.Name + " check DeviceID " + this.device.ID + " type " + typeof this.device.ID);

		const ids = this.device.ID.split("-");

		this.Gateway.parentAdapter.log.debug(this.device.Name + " BaseId " + ids[1] + " length " + ids[1].length);

		if (ids[1].length != 8 || !Number.isInteger(Number(ids[1]))) {

			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong BaseId " + ids[1] + ". Must be a integer with 8 digits." + ids[1].length + " " + Number.isInteger(Number(ids[1])));
		}

		if (this.device.Name === undefined || this.device.Name.length < 2) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong device name " + this.device.Name);
		}

		if (this.device.Type === undefined || this.device.Type == null) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong device type " + this.device.Type);
		}

		if (this.device.MeasurementMethod === undefined || this.device.MeasurementMethod == null) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong device MeasurementMethod " + this.device.MeasurementMethod);
		}

		if (this.device.SerialNr === undefined || this.device.SerialNr.length < 2) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " wrong device SerialNr " + this.device.SerialNr);
		}
		if (this.device.MaxPower === undefined || this.device.MaxPower == null || this.device.MaxPower.length < 1) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " max. Power not set!  " + this.device.MaxPower + "; setting to default 100");
			this.device.MaxPower = 100;
		}

		//muss true sein, um das entsprechende Menü im portal zu bekommen
		device.OptionalEnergy = this.GetOptionalEnergy();

		this.deviceInfo = {
			Identification: {
				DeviceId: device.ID,
				DeviceName: device.Name,
				DeviceType: device.Type,
				DeviceSerial: device.SerialNr,
				DeviceVendor: device.Vendor
			},
			Characteristics: {
				//MaxPowerConsumption: device.MaxPower,
				//MinPowerConsumption: device.MinPower
				MaxPowerConsumption: device.MaxPower
			},
			Capabilities: {
				CurrentPower: { Method: device.MeasurementMethod },
				Timestamps: { AbsoluteTimestamps: false },
				Interruptions: { InterruptionsAllowed: device.InterruptionsAllowed },
				Requests: { OptionalEnergy: device.OptionalEnergy },
			}
		};

		//if (url) {
		//    this.deviceInfo.Identification.DeviceURL = null;
		//}

		//2023-03-11 only if InterruptionsAllowed
		if (device.MinOnTime && device.InterruptionsAllowed) {
			this.deviceInfo.Characteristics.MinOnTime = device.MinOnTime;
		}
		if (device.MaxOnTime && device.InterruptionsAllowed) {
			this.deviceInfo.Characteristics.MaxOnTime = device.MaxOnTime;
		}
		if (device.MinOffTime && device.InterruptionsAllowed) {
			this.deviceInfo.Characteristics.MinOffTime = device.MinOffTime;
		}
		if (device.MaxOffTime && device.InterruptionsAllowed) {
			this.deviceInfo.Characteristics.MaxOffTime = device.MaxOffTime;
		}



		this.URLs2Check = [];
		this.UrlTimerId = [];

		if (device.Type == "EVCharger") {
			//see SEMP-41YE3814-AN-EVCharger-1.0.3.pdf
			//add additional infos
			this.deviceInfo.Characteristics.MaxPowerConsumption = device.MaxPower; //
			if (device.MinPower > 0) {
				this.deviceInfo.Characteristics.MinPowerConsumption = device.MinPower; //needed to control level
			}

			//2023-02-13 sollte nicht fix sein, wird übernommen von den Einstellungen
			//this.deviceInfo.Characteristics.MinOnTime = 900;
			//this.deviceInfo.Characteristics.MinOffTime = 900;

			/*
			this.deviceInfo.Characteristics.AddEnergySwitchOn           //in Wh
			this.deviceInfo.Characteristics.AddCostsSwitchOn            //in €
			this.deviceInfo.Characteristics.PowerLevels
			*/

			this.WallboxIs3PhaseCharging = false;

			if (this.device.WallboxOIDs === undefined || this.device.WallboxOIDs == null) {
				this.Gateway.parentAdapter.log.error("missing wallbox OID configuration " + JSON.stringify(this.device.WallboxOIDs));
			}
			else {
				this.Gateway.parentAdapter.log.debug("wallbox OID configuration (1) " + JSON.stringify(this.device.WallboxOIDs));

				let DeviceOIDPlugConnected = null;
				let DeviceOIDIsCharging = null;
				let DeviceOIDIsError = null;
				let DeviceOIDChargePower = null;
				let DeviceOIDStartCharge = null;
				let DeviceOIDStopCharge = null;
				let DeviceOID3PhaseChargeEnable = null;
				let DeviceOID3PhaseChargeDisable = null;
				let DeviceOIDCounter = null;
				let DeviceOIDStatus = null;
				let DeviceOIDSwitch = null;

				for (let o = 0; o < this.device.WallboxOIDs.length; o++) {
					if (this.device.WallboxOIDs[o].active) {

						if (this.device.WallboxOIDs[o].Name == "DeviceOIDPlugConnected") {
							DeviceOIDPlugConnected = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDPlugConnected"
							};
							if (this.device.WallboxOIDs[o].Type == "URL") {
								DeviceOIDPlugConnected.Path2Check = this.device.WallboxOIDs[o].Path2Check;
							}
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDIsCharging") {
							DeviceOIDIsCharging = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDIsCharging"
							};
							if (this.device.WallboxOIDs[o].Type == "URL") {
								DeviceOIDIsCharging.Path2Check = this.device.WallboxOIDs[o].Path2Check;
							}
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDIsError") {
							DeviceOIDIsError = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDIsError"
							};
							if (this.device.WallboxOIDs[o].Type == "URL") {
								DeviceOIDIsError.Path2Check = this.device.WallboxOIDs[o].Path2Check;
							}

						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDCounter") {
							DeviceOIDCounter = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDCounter"
							};
							if (this.device.WallboxOIDs[o].Type == "URL") {
								DeviceOIDCounter.Path2Check = this.device.WallboxOIDs[o].Path2Check;
							}

						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDStatus") {
							DeviceOIDStatus = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDStatus"
							};
							if (this.device.WallboxOIDs[o].Type == "URL") {
								DeviceOIDStatus.Path2Check = this.device.WallboxOIDs[o].Path2Check;
							}

						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDChargePower") {
							DeviceOIDChargePower = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDChargePower"
							};
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDStartCharge") {
							DeviceOIDStartCharge = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDStartCharge"
							};
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDStopCharge") {
							DeviceOIDStopCharge = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDStopCharge"
							};
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOID3PhaseChargeEnable") {
							DeviceOID3PhaseChargeEnable = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OID3PhaseChargeEnable"
							};
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOID3PhaseChargeDisable") {
							DeviceOID3PhaseChargeDisable = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OID3PhaseChargeDisable"
							};
						}
						else if (this.device.WallboxOIDs[o].Name == "DeviceOIDSwitch") {
							DeviceOIDSwitch = {
								OID: this.device.WallboxOIDs[o].OID,
								Type: this.device.WallboxOIDs[o].Type,
								SetValue: this.device.WallboxOIDs[o].SetValue,
								Name: "OIDSwitch"
							};
						}
					}
				}

				this.device.WallboxOID = {
					DeviceOIDPlugConnected: DeviceOIDPlugConnected,
					DeviceOIDIsCharging: DeviceOIDIsCharging,
					DeviceOIDIsError: DeviceOIDIsError,
					DeviceOIDChargePower: DeviceOIDChargePower,
					DeviceOIDStartCharge: DeviceOIDStartCharge,
					DeviceOIDStopCharge: DeviceOIDStopCharge,
					DeviceOID3PhaseChargeEnable: DeviceOID3PhaseChargeEnable,
					DeviceOID3PhaseChargeDisable: DeviceOID3PhaseChargeDisable,
					DeviceOIDCounter: DeviceOIDCounter,
					DeviceOIDStatus: DeviceOIDStatus,
					DeviceOIDSwitch: DeviceOIDSwitch
				};

				this.Gateway.parentAdapter.log.debug(this.device.Name + " wallbox OID configuration (2) " + JSON.stringify(this.device.WallboxOID));

				// check, dass enable und disable nicht gleich ist
				if (this.device.WallboxOID.DeviceOID3PhaseChargeEnable != null && this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID != null && this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID.length > 5
					&& this.device.WallboxOID.DeviceOID3PhaseChargeDisable != null && this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID != null && this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID.length > 5
					&& this.device.WallboxOID.DeviceOID3PhaseChargeEnable.Type == "URL" && this.device.WallboxOID.DeviceOID3PhaseChargeDisable.Type == "URL"
					&& this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID == this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID) {

					this.Gateway.parentAdapter.log.error(this.device.Name + " wrong DeviceOID3PhaseCharge enable and disable URL should be different   " + this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID + " " + this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID);
				}

			}

			if (this.device.DeviceWallboxPhases == 3 && this.device.Wallbox3phaseSwitchDelay === undefined || this.device.Wallbox3phaseSwitchDelay == null || this.device.Wallbox3phaseSwitchDelay <= 0) {
				this.Gateway.parentAdapter.log.error(this.device.Name + " wrong Wallbox3phaseSwitchDelay  " + this.device.Wallbox3phaseSwitchDelay + "; setting to default 3");
				this.device.Wallbox3phaseSwitchDelay = 3;
			}

			if (this.device.DeviceWallboxPhases == 3 && this.device.Wallbox3phaseSwitchLimit > 4600) {
				this.Gateway.parentAdapter.log.warn(this.device.Name + " check limit to enable 3phase-charging  " + this.device.Wallbox3phaseSwitchLimit + "; it should below 4600 W to avoid unbalanced grid network");
			}

			//test only
			//this.Gateway.parentAdapter.log.warn(this.device.Name + "set test power 8kW");
			//this.SetWallboxPower(8);

		}



		if (device.Type == "DishWasher") {
			this.dishwasherstate = this.states.off;
			this.DishwasherSwitchState = "Off";
			this.DishWasherRecommendation = false;
			this.DishwasherStatusTimerID = setInterval(this.DishWasherSequence.bind(this), 10*1000);
		}

		this.deviceStatus = {
			DeviceId: device.ID,
			EMSignalsAccepted: true,
			Status: "Off",
		};

		this.isConnected = false;
		this.isFastCharging = false;
		this.isStarting = false;
		this.isStopping = false;
		this.isCharging = false;
		this.isError = false;

		this.StatusDetectionOnTimerID = null;
		this.StatusDetectionOffTimerID = null;
		this.InMinRunTime = false;
		this.DisconnectTimerID = null;

		this.start3PhaseChargeTimer = null;
		this.stop3PhaseChargeTimer = null;

		this.CancelRequestTimerID = null;

		this.startup();

		this.Gateway.parentAdapter.log.info("device created " + this.device.ID + " " + this.device.Name);
	}

	//2023-03-11 startup added to support async await
	async startup() {
		await this.createObjects();

		await this.subscribe();

		await this.getCurrentStates();

		await this.SetState();
	}


	destructor() {
		this.Gateway.parentAdapter.log.debug("destructor called ");

		if (this.CancelRequestTimerID) {
			clearTimeout(this.CancelRequestTimerID);
			this.CancelRequestTimerID = null;
		}

		if (this.DishwasherStatusTimerID) {
			clearTimeout(this.DishwasherStatusTimerID);
			this.DishwasherStatusTimerID = null;
		}

		for (let i = 0; i < this.UrlTimerId.length; i++) {
			clearInterval(this.UrlTimerId[i]);
			this.UrlTimerId[i] = null;
		}
	}


	Check2Switch() {

		if (this.planningrequest != null) {
			const ret = this.planningrequest.Check2Switch();

			if (ret.SwitchOff) {
				this.SwitchOff();
			}

			if (ret.restart) {
				//restart timeframe
				if (this.planningrequest != null) {
					if (this.device.Type == "EVCharger" && this.isConnected) {
						this.planningrequest.SetPlugConnected(true);
					}
				}
			}
		}
	}

	async SwitchOff() {

		this.Gateway.parentAdapter.log.debug(this.device.Name + " turn device off");

		await this.Switch(false);
	}
	async SwitchOn() {

		this.Gateway.parentAdapter.log.debug(this.device.Name + " turn device on");

		await this.Switch(true);
	}

	setLastPower(watts, minPower, maxPower) {

		if (this.device.MeasurementUnit == "kW") {
			watts = watts * 1000;
		}

		this.Gateway.parentAdapter.log.debug(this.device.Name + " setLastPower " + watts + " " + typeof watts + " " + this.device.StatusDetection + " " + this.device.MeasurementUnit);

		this.CalcEnergy(watts);
		if (this.planningrequest != null) {
			this.planningrequest.SetCurrentEnergy(Math.round(this.EnergyData.SumEnergy));
		}



		const key = "Devices." + this.device.Name + ".Energy";
		this.Gateway.parentAdapter.setState(key, { ack: true, val: Math.round(this.EnergyData.SumEnergy) });


		if (this.device.StatusDetection == "FromPowerValue") {

			//limit festlegen, 1 Watt könnte standby sein
			let limit = 0;
			if (this.device.StatusDetectionLimit !== undefined && this.device.StatusDetectionLimit != null && Number(this.device.StatusDetectionLimit) > 0) {
				limit = Number(this.device.StatusDetectionLimit);
				this.Gateway.parentAdapter.log.debug(this.device.Name + " set status detection limit to " + limit);
			}

			if (watts > limit) {
				if (this.device.StatusDetectionLimitTimeOn !== undefined && this.device.StatusDetectionLimitTimeOn != null && Number(this.device.StatusDetectionLimitTimeOn) > 0) {

					this.Gateway.parentAdapter.log.debug(this.device.Name + " status detection time limit is " + this.device.StatusDetectionLimitTimeOn + " going to on");
					//going to on
					if (this.deviceStatus.Status == "On" || this.StatusDetectionOnTimerID != null) {
						//nothing to do, already true or timer started
						this.Gateway.parentAdapter.log.debug(this.device.Name + " already on, no timer start");
					}
					else {
						this.StatusDetectionOnTimerID = setTimeout(this.SetStatusOn.bind(this), this.device.StatusDetectionLimitTimeOn * 60 * 1000);
						this.Gateway.parentAdapter.log.debug(this.device.Name + " start setStatusOn - timer");
					}
					if (this.StatusDetectionOffTimerID) {
						this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel setStatusOff - timer");
						clearTimeout(this.StatusDetectionOffTimerID);
						this.StatusDetectionOffTimerID = null;
					}
				}
				else {
					this.setOnOff("On");
				}

				if (this.device.StatusDetectionMinRunTime !== undefined && this.device.StatusDetectionMinRunTime != null && Number(this.device.StatusDetectionMinRunTime) > 0) {
					this.StatusDetectionMinRunTimerID = setTimeout(this.ResetMinRunTime.bind(this), this.device.StatusDetectionMinRunTime * 60 * 1000);
					this.InMinRunTime = true;
				}

			}
			else {
				if (!this.InMinRunTime) {
					if (this.device.StatusDetectionLimitTimeOff !== undefined && this.device.StatusDetectionLimitTimeOff != null && Number(this.device.StatusDetectionLimitTimeOff) > 0) {

						this.Gateway.parentAdapter.log.debug(this.device.Name + " status detection time limit is " + this.device.StatusDetectionLimitTimeOff + " going to off");
						//going to off
						if (this.deviceStatus.Status == "Off" || this.StatusDetectionOffTimerID != null) {
							//nothing to do, already false or timer started
						}
						else {
							this.StatusDetectionOffTimerID = setTimeout(this.SetStatusOff.bind(this), this.device.StatusDetectionLimitTimeOff * 60 * 1000);
							this.Gateway.parentAdapter.log.debug(this.device.Name + " start setStatusOff - timer");
						}
						if (this.StatusDetectionOnTimerID) {
							this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel setStatusOn - timer");
							clearTimeout(this.StatusDetectionOnTimerID);
							this.StatusDetectionOnTimerID = null;
						}
					}
					else {
						this.setOnOff("Off");
					}
				}
				else {
					this.Gateway.parentAdapter.log.debug(this.device.Name + " still in min run time... not to switch off");
				}
			}

		}
		const powerInfo = {
			AveragePower: Math.round(watts),
			Timestamp: 0,
			AveragingInterval: 60
		};

		if (maxPower) {
			powerInfo.MaxPower = Math.round(maxPower);
		}
		if (minPower) {
			powerInfo.MinPower = Math.round(minPower);
		}

		this.deviceStatus.PowerConsumption = {
			PowerInfo: [powerInfo]
		};

	}

	ResetMinRunTime() {
		this.InMinRunTime = false;
	}

	SetStatusOn() {
		clearTimeout(this.StatusDetectionOnTimerID);
		this.StatusDetectionOnTimerID = null;
		this.setOnOff("On");
	}
	SetStatusOff() {
		clearTimeout(this.StatusDetectionOffTimerID);
		this.StatusDetectionOffTimerID = null;
		this.setOnOff("Off");
	}

	setOnOff(state) {

		if (state == "On") {
			//cancel timer if running
			if (this.CancelRequestTimerID) {
				clearTimeout(this.CancelRequestTimerID);
				this.CancelRequestTimerID = null;
			}
		}

		if (this.device.Type == "DishWasher") {

			//just store the state
            this.DishwasherSwitchState = state;

		}
		else {


			//could be On, Off, Offline
			this.Gateway.parentAdapter.log.debug(this.device.Name + " setState " + state);
			this.deviceStatus.Status = state;

			if (this.planningrequest != null) {
				this.planningrequest.SetDeviceStatus(state);
			}

			
		}
		this.SetState();

		if (this.device.MeasurementMethod == "Estimation") {


			//see issue #250: no Power to be send for devices without measurement in off-status
			if (state === "On") {
				this.setLastPower(this.deviceInfo.Characteristics.MaxPowerConsumption, 0, 0);
			}
			else {
				this.setLastPower(0, 0, 0);
			}

		}


	}

	DishWasherSequence() {
		//squence see draw.io diagram

        let lastDishwasherState = this.dishwasherstate;

		this.deviceStatus.Status = "Off";

		if (this.dishwasherstate == this.states.off) {

			this.DishWasherRecommendation = false;
			//check if timeframe is active
			if (this.planningrequest != null && this.planningrequest.getAnyTimefraneActive()) {
				this.dishwasherstate = this.states.TimeframeOn;
			}	
		}
		else if (this.dishwasherstate == this.states.TimeframeOn) {
			//now waitung until user switches device on
            if (this.DishwasherSwitchState == "On") {
				this.dishwasherstate = this.states.waiting4On;

				//switch off the device completely
				this.SwitchOff();


				//todo erst mal auf Off warten?
            }

		}
		else if (this.dishwasherstate == this.states.waiting4On) {
            //now waitung for On-recommndation
			if (this.DishWasherRecommendation) {
				this.dishwasherstate = this.states.on;
				this.Gateway.parentAdapter.log.debug(this.device.Name + " set new recommendation state to on" );

				this.Switch(true);
				this.dishwasherstate = this.states.on;
			}
			if (this.planningrequest == null || this.planningrequest.getAnyTimefraneActive() == false) {
				this.dishwasherstate = this.states.TFended;
			}

		}
		else if (this.dishwasherstate == this.states.on) {
			this.deviceStatus.Status = "On";

			if (this.planningrequest == null || this.planningrequest.getAnyTimefraneActive()==false) {
				this.dishwasherstate = this.states.TFendedWaiting4Device;
			}	
			if (this.DishwasherSwitchState == "Off") {
				this.dishwasherstate = this.states.FinishedWaiting4TF;
			}
		}
		else if (this.dishwasherstate == this.states.FinishedWaiting4TF) {
			if (this.planningrequest == null || this.planningrequest.getAnyTimefraneActive() == false) {
				this.dishwasherstate = this.states.TFended;
			}
		}
		else if (this.dishwasherstate == this.states.TFendedWaiting4Device) {
			this.deviceStatus.Status = "On";
			if (this.DishwasherSwitchState == "Off") {
				this.dishwasherstate = this.states.DeviceFinished;
			}
		}
		else if (this.dishwasherstate == this.states.TFended) {
			this.dishwasherstate = this.states.DeviceInStandby;
		}
		else if (this.dishwasherstate == this.states.DeviceFinished) {
			this.dishwasherstate = this.states.DeviceInStandby;
		}
		else if (this.dishwasherstate == this.states.DeviceInStandby) {
			//check if timeframe is active
			if (this.planningrequest != null && this.planningrequest.getAnyTimefraneActive()) {
				this.dishwasherstate = this.states.TimeframeOn;
			}
		}
		if (lastDishwasherState != this.dishwasherstate) {
            //log only if state changed
			this.Gateway.parentAdapter.log.debug(this.device.Name + " new dishwasher state " + this.dishwasherstate);
		}
	}


	async sendEMRecommendation(em2dev) {

		if (this.device.Type == "EVCharger" && this.isFastCharging) {
			this.Gateway.parentAdapter.log.debug(this.device.Name + " ignoring recommendation because fast charging is active");
		}
		else {
			this.Gateway.parentAdapter.log.debug(this.device.Name + " received recommendation " + JSON.stringify(em2dev) + " " + JSON.stringify(this.lastRecommendation));

			if (this.lastRecommendation == null || this.lastRecommendation.DeviceControl.On != em2dev.DeviceControl.On) {
				await this.setRecommendationState(em2dev.DeviceControl.On);
			}

			await this.setRecommendation(em2dev.DeviceControl.On);

			if (this.device.Type == "EVCharger") {
				await this.setRecommendationPowerConsumption(em2dev.DeviceControl.RecommendedPowerConsumption);

				this.Check3PhaseCharge(em2dev.DeviceControl.RecommendedPowerConsumption);
			}

			this.StartCancelRequest(em2dev.DeviceControl.On);

			this.lastRecommendation = em2dev;
		}
	}

	StartCancelRequest(value) {
		//TimerCancelIfNotOn
		//TimerCancelIfNotOnTime

		if (value) {

			if (this.device.TimerCancelIfNotOn != null && this.device.TimerCancelIfNotOn) {

				if (this.device.TimerCancelIfNotOnTime != null && Number(this.device.TimerCancelIfNotOnTime) > 0) {

					if (this.CancelRequestTimerID) {
						this.Gateway.parentAdapter.log.debug(this.device.Name + " StartCancelRequest, nothing to do, already running");
					}
					else {
						this.Gateway.parentAdapter.log.debug(this.device.Name + " StartCancelRequest");
						this.CancelRequestTimerID = setTimeout(this.CancelRequest.bind(this), Number(this.device.TimerCancelIfNotOnTime) * 60 * 1000);
					}
				}
				else {
					this.Gateway.parentAdapter.log.warn(this.device.Name + " invalid time to cancel energy request " + JSON.stringify(this.device.TimerCancelIfNotOnTime));
				}
			}
			this.SetState();
		}
		else {
			//cancel timer if running
			if (this.CancelRequestTimerID) {
				clearTimeout(this.CancelRequestTimerID);
				this.CancelRequestTimerID = null;
			}
		}
	}

	CancelRequest() {

		this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel energy request because device is not switched on");

		if (this.planningrequest != null) {
			this.planningrequest.CancelActiveTimeframe();
		}
		//switch device off
		this.SwitchOff();

		if (this.CancelRequestTimerID) {
			clearTimeout(this.CancelRequestTimerID);
			this.CancelRequestTimerID = null;
		}
	}



	Check3PhaseCharge(power) {

		if (this.device.DeviceWallboxPhases == 3 && this.device.Wallbox3phaseSwitchLimit > 3000) {
			if (power > this.device.Wallbox3phaseSwitchLimit) {
				//if (power > 4200) {
				if (this.start3PhaseChargeTimer == null) {
					this.start3PhaseChargeTimer = setTimeout(this.Start3PhaseCharging.bind(this), this.device.Wallbox3phaseSwitchDelay * 60 * 1000);
					this.Gateway.parentAdapter.log.debug(this.device.Name + " start 3phase charging start timer");
				}
				if (this.stop3PhaseChargeTimer != null) {
					clearTimeout(this.stop3PhaseChargeTimer);
					this.stop3PhaseChargeTimer = null;
					this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel 3phase charging stop timer");
				}
			}
			else {
				if (this.stop3PhaseChargeTimer == null) {
					this.stop3PhaseChargeTimer = setTimeout(this.Stop3PhaseCharging.bind(this), this.device.Wallbox3phaseSwitchDelay * 60 * 1000);
					this.Gateway.parentAdapter.log.debug(this.device.Name + " start 3phase charging stop timer");
				}

				if (this.start3PhaseChargeTimer != null) {
					clearTimeout(this.start3PhaseChargeTimer);
					this.start3PhaseChargeTimer = null;
					this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel 3phase charging start timer");
				}
			}
		}
	}

	async Start3PhaseCharging() {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " start 3phase charging");
		const key = "Devices." + this.device.Name + ".Enable3PhaseCharge";
		await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: true });

		this.WallboxIs3PhaseCharging = true;

		if (this.device.WallboxOID.DeviceOID3PhaseChargeEnable != null && this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID != null && this.device.WallboxOID.DeviceOID3PhaseChargeEnable.OID.length > 5) {
			await this.setStateTypebased(this.device.WallboxOID.DeviceOID3PhaseChargeEnable);
		}

		clearTimeout(this.start3PhaseChargeTimer);
		this.sart3PhaseChargeTimer = null;
	}

	async Stop3PhaseCharging() {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " stop 3phase charging");
		const key = "Devices." + this.device.Name + ".Enable3PhaseCharge";
		await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: false });

		this.WallboxIs3PhaseCharging = false;

		if (this.device.WallboxOID.DeviceOID3PhaseChargeDisable != null && this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID != null && this.device.WallboxOID.DeviceOID3PhaseChargeDisable.OID.length > 5) {
			await this.setStateTypebased(this.device.WallboxOID.DeviceOID3PhaseChargeDisable);
		}

		clearTimeout(this.stop3PhaseChargeTimer);
		this.stop3PhaseChargeTimer = null;
	}

	async setRecommendationState(value) {

		this.Gateway.parentAdapter.log.debug(this.device.Name + " new recommendation " + value);

		let key = "Devices." + this.device.Name + ".RecommendedState";
		await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: value });
		key = "Devices." + this.device.Name + ".Changed";
		const now = new Date();
		await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: now.toLocaleTimeString("de-DE") });
	}

	async setRecommendationPowerConsumption(value) {

		/*
		newDevice2 set new charge power undefined
		newDevice2 set new state waiting
		newDevice2 new recommendation power undefined
		*/

		let val = 0;

		if (value === undefined) {
			val = 0;
		}
		else {
			val = value;
		}

		this.Gateway.parentAdapter.log.debug(this.device.Name + " new recommendation power " + val + " " + typeof val);

		await this.SetWallboxPower(val);

		const key = "Devices." + this.device.Name + ".RecommendedPower";
		await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: val });
	}

	async setRecommendation(value) {

		if (this.device.HasOIDSwitch) {

			if (this.device.Type == "DishWasher") {
				this.DishWasherRecommendation = value;

				this.Gateway.parentAdapter.log.debug(this.device.Name + " set new recommendation state for dishwasher to " + value);
			}
			else {


				this.Gateway.parentAdapter.log.debug(this.device.Name + " set new recommendation state to " + value);

				await this.Switch(value);
			}



		}
		if (this.device.Type == "EVCharger") {
			if (value) {
				await this.StartWallbox();
			}
			else {
				await this.StopWallbox();
			}
		}
	}

	async Switch(value) {


		let setstate = "unknown";
		//get current state, if different set it
		if (this.device.OID_Switch != null && this.device.OID_Switch.length > 3) {
			const curVal = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.OID_Switch);

			this.Gateway.parentAdapter.log.debug(this.device.Name + " got state " + JSON.stringify(curVal) + " target is " + value);

			if (curVal != null && curVal.val != value) {

				this.Gateway.parentAdapter.log.debug(this.device.OID_Switch + " set state " + value);
				await this.Gateway.parentAdapter.setForeignStateAsync(this.device.OID_Switch, value);
				if (value) {
					setstate = "SetOn";
				}
				else {
					setstate = "SetOff";
				}
			}
		}
		else {
			this.Gateway.parentAdapter.log.debug(this.device.Name + " no switch configured");
		}

		if (this.logger != null) {
			const records = [];
			//hier records bauen
			const record = {
				Time: new Date().toLocaleString("de-DE"),
				DeviceId: this.device.ID,
				DeviceName: this.device.Name,
				Status: setstate

			};
			records.push(record);

			//und jetzt alle schreiben
			this.logger.WriteCSVLog(0, records);
		}



	}

	async getCurrentStates() {

		try {
			/*
			//holen von TimeOn vom state, damit wert nach reboot nicht verloren geht...
			let key = "Devices." + this.device.Name + ".TimeOn";
			let curVal = await this.Gateway.parentAdapter.getStateAsync(key);

			if (curVal != null) {
				let vals = curVal.val.split(":");
				if (vals.length > 1) {

					//todo

				}
			}
*/

			//holen von State und setzen, damit OnTime richtig berechnet wird
			const key = "Devices." + this.device.Name + ".RecommendedState";
			const curVal = await this.Gateway.parentAdapter.getStateAsync(key);
			//not used yet
		}
		catch (e) {
			this.Gateway.parentAdapter.log.error("exception in getCurrentStates [" + e + "]");
		}
	}

	async createObjects() {

		let key = "Devices." + this.device.Name + ".RecommendedState";
		let obj = {
			type: "state",
			common: {
				name: "recommended state got from SHM",
				type: "boolean",
				role: "state",
				read: true,
				write: false,
				desc: "value set by SHM"
			}
		};
		await this.CreateObject(key, obj);
		await this.SetDefault(key, false);

		key = "Devices." + this.device.Name + ".Changed";
		obj = {
			type: "state",
			common: {
				name: "last time recommendation changed",
				type: "string",
				role: "value.time",
				read: true,
				write: false
			}
		};
		await this.CreateObject(key, obj);
		await this.SetDefault(key, "none");

		key = "Devices." + this.device.Name + ".State";
		obj = {
			type: "state",
			common: {
				name: "current State",
				type: "string",
				role: "state",
				read: true,
				write: false
			}
		};
		await this.CreateObject(key, obj);
		await this.SetDefault(key, "unknown");

		key = "Devices." + this.device.Name + ".Energy";
		obj = {
			type: "state",
			common: {
				name: "Energy used",
				type: "number",
				unit: "Wh",
				role: "value",
				read: true,
				write: false
			}
		};
		await this.CreateObject(key, obj);
		await this.SetDefault(key, 0);


		if (this.device.Type == "EVCharger") {

			key = "Devices." + this.device.Name + ".MinEnergy";
			obj = {
				type: "state",
				common: {
					name: "minimum energy for charging",
					type: "number",
					unit: "Wh",
					role: "value",
					read: true,
					write: true
				}
			};
			await this.CreateObject(key, obj);
			await this.SetDefault(key, 0.1 * this.device.BatteryCapacity);

			key = "Devices." + this.device.Name + ".MaxEnergy";
			obj = {
				type: "state",
				common: {
					name: "maximum energy for charging",
					type: "number",
					unit: "Wh",
					role: "value",
					read: true,
					write: true
				}
			};
			await this.CreateObject(key, obj);
			await this.SetDefault(key, this.device.BatteryCapacity);

			key = "Devices." + this.device.Name + ".RecommendedPower";
			obj = {
				type: "state",
				common: {
					name: "recommended power got from SHM",
					type: "number",
					unit: "W",
					role: "value",
					read: true,
					write: false
				}
			};
			await this.CreateObject(key, obj);

			key = "Devices." + this.device.Name + ".EnableFastCharging";
			obj = {
				type: "state",
				common: {
					name: "start fast charging with highest power",
					type: "boolean",
					unit: "",
					role: "value",
					read: false,
					write: true
				}
			};
			await this.CreateObject(key, obj);
			await this.SetDefault(key, false);

			if (this.device.DeviceWallboxPhases != null && this.device.DeviceWallboxPhases == 3) {
				key = "Devices." + this.device.Name + ".Enable3PhaseCharge";
				obj = {
					type: "state",
					common: {
						name: "signal to EV to enable 3phase charging",
						type: "boolean",
						unit: "",
						role: "value",
						read: true,
						write: false
					}
				};
				await this.CreateObject(key, obj);
				await this.SetDefault(key, false);

				this.Check3PhaseCharge(0);
			}

			if (this.device.WallboxChargeTime != null && this.device.WallboxChargeTime == 4) {
				key = "Devices." + this.device.Name + ".MaxChargeTime";
				obj = {
					type: "state",
					common: {
						name: "user defined maximum time to charge",
						type: "string",
						unit: "hh:mm",
						role: "value",
						read: true,
						write: true
					}
				};
				await this.CreateObject(key, obj);
				await this.SetDefault(key, "06:00");
			}

			if ( this.device.WallboxNeedCurrentRecommendation) {
				key = "Devices." + this.device.Name + ".RecommendedCurrent";
				obj = {
					type: "state",
					common: {
						name: "recommended current calculated from recommended power",
						type: "number",
						unit: "A",
						role: "value",
						read: true,
						write: false
					}
				};
				await this.CreateObject(key, obj);
				await this.SetDefault(key, 0);
			}
		}
	}

	async CreateObject(key, obj) {

		const obj_new = await this.Gateway.parentAdapter.getObjectAsync(key);
		this.Gateway.parentAdapter.log.debug(this.device.Name + " got object " + JSON.stringify(obj_new) + " for " + key);

		if (obj_new != null) {

			if ((obj_new.common.role != obj.common.role
				|| obj_new.common.type != obj.common.type
				|| (obj_new.common.unit != obj.common.unit && obj.common.unit != null)
				|| obj_new.common.read != obj.common.read
				|| obj_new.common.write != obj.common.write
				|| obj_new.common.name != obj.common.name)
				&& obj.type === "state"
			) {
				this.Gateway.parentAdapter.log.warn(this.device.Name + " change object " + JSON.stringify(obj) + " " + JSON.stringify(obj_new));
				await this.Gateway.parentAdapter.extendObject(key, {
					common: {
						name: obj.common.name,
						role: obj.common.role,
						type: obj.common.type,
						unit: obj.common.unit,
						read: obj.common.read,
						write: obj.common.write
					}
				});
			}
		}
		else {
			this.Gateway.parentAdapter.log.warn(this.device.Name + " create object " + key);
			await this.Gateway.parentAdapter.setObjectNotExistsAsync(key, obj);
		}
	}

	async SetDefault(key, value) {

		const current = await this.Gateway.parentAdapter.getStateAsync(key);

		if (current == null || current.val == 0 || current.val == "") {
			await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: value });
		}
	}


	async subscribe() {

		if (this.device.Type != "EVCharger") {
			if (this.device.MeasurementMethod == "Measurement") {
				if (this.device.OID_Power != null && this.device.OID_Power.length > 5) {
					this.Gateway.parentAdapter.log.debug("subscribe OID_Power " + this.device.OID_Power);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.OID_Power);

					//and get last value
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.OID_Power);
					if (current != null && current.val != null) {
						this.setLastPower(current.val, 0, 0);
					}
				}
				else {
					this.Gateway.parentAdapter.log.warn("no OID_Power specified " + this.device.OID_Power);
				}
			}
			else {
				this.setLastPower(0, 0, 0);
			}

			if (this.device.StatusDetection == "SeparateOID") {
				if (this.device.OID_Status != null && this.device.OID_Status.length > 5) {
					this.Gateway.parentAdapter.log.debug("subscribe OID_Status " + this.device.OID_Status);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.OID_Status);

					//and get last value
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.OID_Status);
					if (current != null && current.val != null) {

						if (current.val) {
							this.setOnOff("On");
						}
						else {
							this.setOnOff("Off");
						}
					}

				}
				else {
					this.Gateway.parentAdapter.log.warn("no OID_Status specified " + this.device.OID_Status);
				}
			}
		}

		await this.SubscribeWallbox();
	}


	GetOptionalEnergy() {

		let bRet = false;

		if (this.device.Type == "EVCharger") {
			bRet = true;
		}
		else {
			if (this.device.HasOIDSwitch) {
				bRet = true;
			}

			if (this.device.StatusDetection == "AlwaysOn") {
				bRet = false;
			}
		}
		this.Gateway.parentAdapter.log.debug("can use optional energy: " + bRet);

		return bRet;
	}

	async SetState() {

		let state = this.states.waiting;

		if (this.device.Type == "EVCharger") {

			if (this.isConnected) {

				state = this.states.plugConnected;
				if (this.isCharging) {
					state = this.states.charging;
					this.isStarting = false;
					this.isStopping = false;
				}
				if (this.isStarting) {
					state = this.states.startCharge;
				}
				if (this.isStopping) {
					state = this.states.stopCharge;
				}
				if (this.isFastCharging) {
					state = this.states.fastCharging;
				}
			}
			else {
				state = this.states.plugNotConnected;
				this.isStarting = false;
				this.isStopping = false;
				this.isCharging = false;
				this.isFastCharging = false;
			}
		}
		else {

			if (this.CancelRequestTimerID != null) {
				state = this.states.waiting4On;
			}
			else if (this.deviceStatus.Status == "On") {
				state = this.states.on;
			}
		}

		const key = "Devices." + this.device.Name + ".State";

		//nur setzen, wenn geändert 2023-02-25
		const currentState = await this.Gateway.parentAdapter.getStateAsync(key);

		this.Gateway.parentAdapter.log.debug(this.device.Name + " in SetState got " + JSON.stringify(currentState) + " from " + key);

		//2023-03-11 check for null added
		if (currentState == null || currentState.val != state) {
			await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: state });
			this.Gateway.parentAdapter.log.debug(this.device.Name + " in SetState, set new state " + state);
		}
		else {
			this.Gateway.parentAdapter.log.debug(this.device.Name + " in SetState, no new state to set, is " + state);
		}
	}

	//=====================================================================================
	//wallbox



	async getStateTypebased(sensor) {

		let bRet = -1;
		if (sensor !== undefined && sensor != null) {
			const oid = sensor.OID;

			if (typeof oid === "string" && oid != null && oid.length > 5) {
				const current = await this.Gateway.parentAdapter.getForeignStateAsync(oid);
				if (current != null && current.val != null) {

					if (sensor.Type == "Boolean") {
						if (current.val === Boolean(sensor.SetValue)) {
							bRet = true;
						}
						else {
							bRet = false;
						}
					}
					else if (sensor.Type == "Number") {
						if (current.val === Number(sensor.SetValue)) {
							bRet = true;
						}
						else {
							bRet = false;
						}
					}
					else if (sensor.Type == "URL") {
						this.Gateway.parentAdapter.log.error(sensor.Name + " URL sensor type not yet supported, please inform developer!" + sensor.SetValue);
					}
					else {
						this.Gateway.parentAdapter.log.warn(sensor.Name + " unknown sensor type " + sensor.Type);
					}
				}
			}
		}
		else {
			this.Gateway.parentAdapter.log.error("getStateTypeBased: sensor not found");
		}
		return bRet;
	}

	async setStateTypebased(actor) {
		if (actor !== undefined && actor != null) {

			const key = actor.OID;
			//const value = actor.SetValue;

			this.Gateway.parentAdapter.log.debug(actor.Name + " actor type " + actor.Type + " setValue " + actor.SetValue + " " + typeof actor.SetValue);
			if (actor.Type == "Boolean") {
				let val = false;
				if (actor.SetValue == true || actor.SetValue == "true") {
					val = true;
				}
				else if (actor.SetValue == false || actor.SetValue == "false") {
					val = false;
				}
				else {
					this.Gateway.parentAdapter.log.warn(actor.Name + " unknown set value " + actor.SetValue + " as " + actor.Type);
				}
				await this.Gateway.parentAdapter.setForeignStateAsync(key, { ack: false, val: val });
			}
			else if (actor.Type == "Number") {
				const val = Number(actor.SetValue);

				await this.Gateway.parentAdapter.setForeignStateAsync(key, { ack: false, val: val });
			}
			else if (actor.Type == "URL") {

				let url = actor.OID;

				if (typeof url === "string" && url != null && url.length > 5) {

					try {
						const axios = require("axios");

						const config = {
							headers: {

							},
							timeout: 5000
						};

						if (actor.SetValue != null && actor.SetValue.length > 1 && actor.SetValue != "not used") {
							url = url + "?" + actor.SetValue;
						}

						if (actor.newValue != null) {
							url = url + actor.newValue;
						}


						this.Gateway.parentAdapter.log.warn(actor.Name + " call get URL " + url);

						const result = await axios.get(url, null, config);

						this.Gateway.parentAdapter.log.debug(actor.Name + " result URL " + JSON.stringify(result.data));
					}

					catch (e) {
						this.Gateway.parentAdapter.log.error(actor.Name + " got error " + e + " after calling url");
					}
				}
				else {
					this.Gateway.parentAdapter.log.error(actor.Name + " unknown url " + actor.SetValue);
				}
			}
			else {
				this.Gateway.parentAdapter.log.warn(actor.Name + " unknown actor type " + actor.Type);
			}
		}
		else {
			this.Gateway.parentAdapter.log.error(this.device.Name + " setStateTypeBased: actor not found");
		}
		return;
	}



	checkStateTypebased(sensor, value) {

		let bRet = -1;
		if (sensor !== undefined && sensor != null) {

			this.Gateway.parentAdapter.log.debug(sensor.Name + " sensor type " + sensor.Type + " setValue " + sensor.SetValue + " value " + value + " " + typeof sensor.SetValue + " " + typeof value);
			if (sensor.Type == "Boolean") {
				if (value === Boolean(sensor.SetValue)) {
					bRet = true;
				}
				else {
					bRet = false;
				}
			}
			else if (sensor.Type == "Number") {
				if (value === Number(sensor.SetValue)) {
					bRet = true;
				}
				else {
					bRet = false;
				}
			}
			else if (sensor.Type == "URL") {
				//wir kommen hierhin bereits mit dem richtigen Wert
				bRet = value;
			}
			else {
				this.Gateway.parentAdapter.log.warn(sensor.Name + " unknown sensor type " + sensor.Type);
			}
		}
		return bRet;
	}

	async SubscribeWallbox() {

		if (this.device.Type == "EVCharger") {
			if (this.device.WallboxOID.DeviceOIDPlugConnected != null && this.device.WallboxOID.DeviceOIDPlugConnected.OID != null && this.device.WallboxOID.DeviceOIDPlugConnected.OID.length > 5) {
				if (this.device.WallboxOID.DeviceOIDPlugConnected.Type == "URL") {
					this.AddUrl(this.device.WallboxOID.DeviceOIDPlugConnected);
				}
				else {
					this.Gateway.parentAdapter.log.debug("subscribe OID_PlugConnected " + this.device.WallboxOID.DeviceOIDPlugConnected.OID);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.WallboxOID.DeviceOIDPlugConnected.OID);

					//and get last state
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.WallboxOID.DeviceOIDPlugConnected.OID);
					//hier nur state holen, umrechnung type based erfolgt noch
					if (current != null) {
						this.setWallboxPlugConnected(current.val);
					}
					else {
						this.Gateway.parentAdapter.log.error("could not read value of " + this.device.WallboxOID.DeviceOIDPlugConnected.OID);
					}
				}
			}
			if (this.device.WallboxOID.DeviceOIDIsCharging != null && this.device.WallboxOID.DeviceOIDIsCharging.OID != null && this.device.WallboxOID.DeviceOIDIsCharging.OID.length > 5) {
				if (this.device.WallboxOID.DeviceOIDIsCharging.Type == "URL") {
					this.AddUrl(this.device.WallboxOID.DeviceOIDIsCharging);
				}
				else {
					this.Gateway.parentAdapter.log.debug("subscribe OID_IsCharging " + this.device.WallboxOID.DeviceOIDIsCharging.OID);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.WallboxOID.DeviceOIDIsCharging.OID);

					//and get last state
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.WallboxOID.DeviceOIDIsCharging.OID);
					if (current != null) {
						this.setWallboxIsCharging(current.val);
					}
					else {
						this.Gateway.parentAdapter.log.error("could not read value of " + this.device.WallboxOID.DeviceOIDIsCharging.OID);
					}
				}
			}
			if (this.device.WallboxOID.DeviceOIDIsError != null && this.device.WallboxOID.DeviceOIDIsError.OID != null && this.device.WallboxOID.DeviceOIDIsError.OID.length > 5) {
				if (this.device.WallboxOID.DeviceOIDIsError.Type == "URL") {
					this.AddUrl(this.device.WallboxOID.DeviceOIDIsError);
				}
				else {
					this.Gateway.parentAdapter.log.debug("subscribe OID_IsError " + this.device.WallboxOID.DeviceOIDIsError.OID);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.WallboxOID.DeviceOIDIsError.OID);

					//and get last state
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.WallboxOID.DeviceOIDIsError.OID);
					if (current != null) {
						this.setWallboxIsError(current.val);
					}
					else {
						this.Gateway.parentAdapter.log.error("could not read value of " + this.device.WallboxOID.DeviceOIDIsError.OID);
					}
				}
			}

			if (this.device.WallboxOID.DeviceOIDCounter != null && this.device.WallboxOID.DeviceOIDCounter.OID != null && this.device.WallboxOID.DeviceOIDCounter.OID.length > 5) {
				if (this.device.WallboxOID.DeviceOIDCounter.Type == "URL") {
					this.AddUrl(this.device.WallboxOID.DeviceOIDCounter);
				}
				else {
					this.Gateway.parentAdapter.log.debug("subscribe OID_Counter " + this.device.WallboxOID.DeviceOIDCounter.OID);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.WallboxOID.DeviceOIDCounter.OID);

					//and get last state
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.WallboxOID.DeviceOIDCounter.OID);
					if (current != null) {
						this.setLastPower(current.val);
					}
					else {
						this.Gateway.parentAdapter.log.error("could not read value of " + this.device.WallboxOID.DeviceOIDCounter.OID);
					}
				}
			}

			if (this.device.WallboxOID.DeviceOIDStatus != null && this.device.WallboxOID.DeviceOIDStatus.OID != null && this.device.WallboxOID.DeviceOIDStatus.OID.length > 5) {
				if (this.device.WallboxOID.DeviceOIDStatus.Type == "URL") {
					this.AddUrl(this.device.WallboxOID.DeviceOIDStatus);
				}
				else {
					this.Gateway.parentAdapter.log.debug("subscribe OID_Status " + this.device.WallboxOID.DeviceOIDStatus.OID);
					this.Gateway.parentAdapter.subscribeForeignStates(this.device.WallboxOID.DeviceOIDStatus.OID);

					//and get last state
					const current = await this.Gateway.parentAdapter.getForeignStateAsync(this.device.WallboxOID.DeviceOIDStatus.OID);
					if (current != null) {
						this.setOnOff(current.val);
					}
					else {
						this.Gateway.parentAdapter.log.error("could not read value of " + this.device.WallboxOID.DeviceOIDStatus.OID);
					}
				}
			}


			this.WallboxSubscribeUrl();

			let key = "Devices." + this.device.Name + ".MinEnergy";
			this.Gateway.parentAdapter.log.debug("subscribe  " + key);
			this.Gateway.parentAdapter.subscribeStates(key);


			key = "Devices." + this.device.Name + ".MaxEnergy";
			this.Gateway.parentAdapter.log.debug("subscribe  " + key);
			this.Gateway.parentAdapter.subscribeStates(key);

			//and get last state
			await this.GetEnergy4Wallbox();

			key = "Devices." + this.device.Name + ".EnableFastCharging";
			this.Gateway.parentAdapter.subscribeStates(key);


			if (this.device.WallboxChargeTime != null && this.device.WallboxChargeTime == 4) {
				key = "Devices." + this.device.Name + ".MaxChargeTime";
				this.Gateway.parentAdapter.subscribeStates(key);
			}

		}
	}

	AddUrl(OID) {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " subscribe URL  " + JSON.stringify(OID));

		const URL = OID.OID;

		if (this.URLs2Check.indexOf(URL) < 0) {
			this.URLs2Check.push(URL);
		}

		this.Gateway.parentAdapter.log.debug(this.device.Name + " subscribe URL  " + JSON.stringify(this.URLs2Check));

	}

	WallboxSubscribeUrl() {
		for (let i = 0; i < this.URLs2Check.length; i++) {
			//pro URL call 100ms verzögerung

			let PollRate = this.device.URLReadPollRate;

			if (PollRate == null || PollRate < 5) {
				this.Gateway.parentAdapter.log.warn(this.device.Name + " setting URL pool rate to minimim of 5, current was  " + PollRate);
				PollRate = 5;
			}

			this.UrlTimerId[i] = setInterval(this.CheckURLStatus.bind(this), PollRate * 1000 + i * 100, this.URLs2Check[i]);
		}
	}

	async CheckURLStatus(url) {
		//this.Gateway.parentAdapter.log.debug(this.device.Name + " check URL called  " + url);

		try {
			const axios = require("axios");

			const config = {
				headers: {

				},
				timeout: 5000
			};

			this.Gateway.parentAdapter.log.debug(this.device.Name + " call get URL " + url + " " + JSON.stringify(config));

			if (typeof url != "string") {
				this.Gateway.parentAdapter.log.error(this.device.Name + " URL must be a string but is " + typeof url);
			}

			const result = await axios.get(url, null, config);
			const data = result.data;
			this.Gateway.parentAdapter.log.debug(this.device.Name + " result URL " + JSON.stringify(data));

			//https://regex101.com/codegen?language=javascript

			let current = this.CheckURLResult(url, this.device.WallboxOID.DeviceOIDPlugConnected, data);
			if (current) {
				if (!this.isConnected)
					await this.setWallboxPlugConnected(true);
			}
			else {
				if (this.isConnected)
					await this.setWallboxPlugConnected(false);
			}

			current = this.CheckURLResult(url, this.device.WallboxOID.DeviceOIDIsCharging, data);
			if (current) {
				if (!this.isCharging)
					await this.setWallboxIsCharging(true);
			}
			else {
				if (this.isCharging)
					await this.setWallboxIsCharging(false);
			}

			current = this.CheckURLResult(url, this.device.WallboxOID.DeviceOIDIsError, data);
			if (current) {
				if (!this.isError)
					await this.setWallboxIsError(true);
			}
			else {
				if (this.isError)
					await this.setWallboxIsError(false);
			}
			current = this.CheckURLResult(url, this.device.WallboxOID.DeviceOIDCounter, data);
			if (current != null) {
				this.setLastPower(current);
			}
			current = this.CheckURLResult(url, this.device.WallboxOID.DeviceOIDStatus, data);
			if (current) {
				this.setOnOff("On");
				this.Gateway.parentAdapter.log.debug(this.device.Name + " set status " + current);
			}
			else {
				this.setOnOff("Off");
				this.Gateway.parentAdapter.log.debug(this.device.Name + " set status " + current);
			}
		}
		catch (e) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " CheckURLStatus got error " + e + " after calling url " + url);
		}
	}

	CheckURLResult(url, sensor, data) {

		let ret = false;
		try {
			if (sensor != null && url == sensor.OID) {



				/*
				//check only
				const testresult = {
					"rfb": 1875,
					"alw": false,
					"acu": null,
					"adi": false,
					"dwo": 3,
					"tpa": 1436.667,
					"sse": "056300",
					"eto": 9421550,
					"lwf": 1682369486,
					"scaa": 1682372910,
					"wst": 3,
					"wsc": 0,
					"wsms": 3,
					"wfb": null,
					"wcb": "1E:E8:29:CD:2D:9C",
					"wpb": ["7A:83:C2:91:DB:C8", "E6:63:DA:E7:0F:69"],
					"nif": "st",
					"dns":
						{ "dns0": "192.168.0.1", "dns1": "0.0.0.0", "dns2": "0.0.0.0" },
					"host": "go-echarger_056300",
					"rssi": -66,
					"wda": false,
					"tse": false,
					"tsss": 0,
					"tof": 60,
					"tds": 1,
					"tzt": "",
					"utc": "2023-10-29T06:43:59.905",
					"loc": "2023-10-29T07:43:59.906 +01:00",
					"led": {
						"id": 16, "name": "Pulsate", "norwayOverlay": true, "modeOverlay": true, "subtype": "renderCmds", "ranges": [{ "from": 0, "to": 6, "fade": "2048ms", "colors0": ["#0000FF"], "colors1": ["#000000"] }, { "from": 7, "to": 31, "colors": ["#000000"] }]
					},
					"lbr": 9,
					"lmo": 3,
					"ama": 32,
					"tcl": null,
					"die": true,
					"dii": false,
					"la1": 16,
					"la3": 16,
					"di1": false,
					"pgr": false,
					"pdi": false,
					"clp": [10, 16, 20, 24, 32],
					"bac": 1,
					"sdp": 2,
					"lbp": null,
					"amp": 7,
					"fna": "go-eCharger_056300",
					"rdbs": 0,
					"rdes": 0,
					"rdbf": 0,
					"rdef": 0,
					"rdre": 0,
					"rdpl": 0,
					"rdbse": null,
					"rdese": null,
					"rdbfe": null,
					"rdefe": null,
					"rdree": null,
					"rdple": null,
					"cid": "#0000FF",
					"cwc": "#FFFF00",
					"cch": "#00FFFF",
					"cfi": "#006700",
					"ust": 2,
					"lck": 2,
					"sch_week":
					{
						"control": 0, "ranges": [
							{ "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }, { "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }]
					},
					"sch_satur": {
						"control": 0, "ranges": [{ "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }, { "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }]
					},
					"sch_sund": {
						"control": 0, "ranges": [{ "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }, { "begin": { "hour": 0, "minute": 0, "second": 0 }, "end": { "hour": 0, "minute": 0, "second": 0 } }]
					},
					"nmo": false,
					"fsp": true,
					"acs": 0,
					"frc": 1,
					"rbc": 98,
					"rbt": 1699321397,
					"car": 4,
					"err": 0,
					"cbl": 32,
					"pha": [false, false, false, true, true, true],
					"dws": 12345
				};


				data = testresult;

				this.Gateway.parentAdapter.log.warn(this.device.Name + " test " + JSON.stringify(data));
				*/


				const m = data[sensor.Path2Check];

				if (m != null) {

					//wenn kein Wert zur Prüfung angegeben, wird der Wert selbst aus dem Pfad zuückgegeben (für currentPower genutzt)
					if (sensor.SetValue != null && sensor.SetValue.length > 0) {
						const regex = new RegExp(sensor.SetValue);
						const newValue = regex.exec(m);

						if (newValue != null) {
							this.Gateway.parentAdapter.log.debug(this.device.Name + " " + sensor.Name + " true ");
							ret = true;
						}
						else {
							this.Gateway.parentAdapter.log.debug(this.device.Name + " " + sensor.Name + " false ");
							ret = false;
						}
					}
					else {
						this.Gateway.parentAdapter.log.debug(this.device.Name + " got value from url-call " + m);
						ret = m;
					}
				}
				else {
					this.Gateway.parentAdapter.log.warn(this.device.Name + " result is for " + sensor.Name + ", not Found, locking for  '" + sensor.Path2Check + "' got " + m + " " + JSON.stringify(data) + " " + typeof sensor.SetValue);
				}
			}
		}
		catch (e) {
			this.Gateway.parentAdapter.log.error(this.device.Name + " CheckURLResult got error " + e + "  " + JSON.stringify(sensor));
		}
		return ret;
	}


	async GetEnergy4Wallbox() {
		let key = "Devices." + this.device.Name + ".MinEnergy";
		let current = await this.Gateway.parentAdapter.getStateAsync(key);
		let minEnergy = 0;
		if (current != null && current.val != null) {
			minEnergy = current.val;
		}

		key = "Devices." + this.device.Name + ".MaxEnergy";
		current = await this.Gateway.parentAdapter.getStateAsync(key);
		let maxEnergy = 0;
		if (current != null && current.val != null) {
			maxEnergy = current.val;
		}

		if (minEnergy >= 0) {
			if (this.planningrequest != null) {
				this.planningrequest.SetMinEnergy(minEnergy);
			}
		}
		if (maxEnergy > 0) {
			if (this.planningrequest != null) {
				this.planningrequest.SetMaxEnergy(maxEnergy);
			}
		}
	}


	async StartWallbox() {

		if (this.device.WallboxOID.DeviceOIDStartCharge != null && this.device.WallboxOID.DeviceOIDStartCharge.OID != null && this.device.WallboxOID.DeviceOIDStartCharge.OID.length > 5) {
			await this.setStateTypebased(this.device.WallboxOID.DeviceOIDStartCharge);
		}
		this.isStarting = true;
		await this.SetState();
	}

	async StopWallbox() {


		if (this.device.WallboxOID.DeviceOIDStopCharge != null && this.device.WallboxOID.DeviceOIDStopCharge.OID != null && this.device.WallboxOID.DeviceOIDStopCharge.OID.length > 5) {
			await this.setStateTypebased(this.device.WallboxOID.DeviceOIDStopCharge);
		}

		this.isStopping = true;
		this.SetWallboxPower(0);
		this.Check3PhaseCharge(0);
		this.SetState();
	}

	async SetWallboxPower(value) {

		if (this.device.Type == "EVCharger") {

			let Current2Set = 0;
			if (this.device.WallboxNeedCurrentRecommendation) {

				if (this.device.WallboxPhases == 1 || (this.device.WallboxPhases == 3 && this.WallboxIs3PhaseCharging == false)) {
					Current2Set = Math.floor(value / 230);
					//sollte zwischen 6 und 32 A sein
					if (Current2Set > 32) {
						Current2Set = 32;
						this.Gateway.parentAdapter.log.warn(this.device.Name + " current limited to 32A ");
					}
					if (Current2Set < 6 && Current2Set > 0) {
						Current2Set = 6;
						this.Gateway.parentAdapter.log.warn(this.device.Name + " current limited to 6A ");
					}
				}
				if (this.device.WallboxPhases == 2 || (this.device.WallboxPhases == 3 && this.WallboxIs3PhaseCharging == true)) {
					Current2Set = Math.floor(value / 400 / Math.sqrt(3)) ;
					//sollte zwischen 6 und 32 A sein
					if (Current2Set > 32) {
						Current2Set = 32;
						this.Gateway.parentAdapter.log.warn(this.device.Name + " current limited to 32A ");
					}
					if (Current2Set < 6 && Current2Set > 0) {
						Current2Set = 6;
						this.Gateway.parentAdapter.log.warn(this.device.Name + " current limited to 6A ");
					}
				}
				this.Gateway.parentAdapter.log.debug(this.device.Name + " charge current " + Current2Set);

				const key = "Devices." + this.device.Name + ".RecommendedCurrent";
				await this.Gateway.parentAdapter.setStateAsync(key, { ack: true, val: Current2Set });

			}

			if (this.device.WallboxOID.DeviceOIDChargePower != null && this.device.WallboxOID.DeviceOIDChargePower.OID != null && this.device.WallboxOID.DeviceOIDChargePower.OID.length > 5) {

				//http://192.168.3.52/wallboxdummy/chargepower?amp=7
				//bei URL steht in SetValue der wert aus dem admin
				if (this.device.WallboxOID.DeviceOIDChargePower.Type == "URL") {
					this.device.WallboxOID.DeviceOIDChargePower.newValue = this.device.WallboxNeedCurrentRecommendation ? Current2Set : value;
				}
				else {
					this.device.WallboxOID.DeviceOIDChargePower.SetValue = value;
				}

				await this.setStateTypebased(this.device.WallboxOID.DeviceOIDChargePower);

			}
			this.Gateway.parentAdapter.log.debug(this.device.Name + " set new charge power " + value + " " + typeof value);
			if (value > 0) {
				this.isCharging = true;
			}
			else {
				this.isCharging = false;
			}

			await this.SetState();
		}
	}

	//wallbox interface 2 gateway
	async setWallboxPlugConnected(value) {
		//check type based and set value based
		const state = this.checkStateTypebased(this.device.WallboxOID.DeviceOIDPlugConnected, value);
		this.Gateway.parentAdapter.log.info(this.device.Name + " wallbox plug connected " + state);

		//set timeframe and request
		if (this.planningrequest != null) {
			this.planningrequest.SetPlugConnected(state);
		}
		if (state) {

			if (this.DisconnectTimerID) {
				this.Gateway.parentAdapter.log.debug(this.device.Name + " cancel disconnect - timer");
				clearTimeout(this.DisconnectTimerID);
				this.DisconnectTimerID = null;
			}

			this.isConnected = true;
			//2023-03-11 added to inform SHM that device can be controlled because it's connected
			this.deviceStatus.EMSignalsAccepted = true;

			this.EnergyData.lastTimestamp = -99;
			this.EnergyData.SumEnergy = 0;

			await this.GetEnergy4Wallbox();

			this.GetMaxChargTime();

		}
		else {
			if (this.isConnected) {

				this.DisconnectTimerID = setTimeout(this.SetDisconnected.bind(this), 60 * 1000);
				this.Gateway.parentAdapter.log.debug(this.device.Name + " start disconnect - timer");
			}
			else {
				await this.SetDisconnected();
			}
		}
		this.SetState();
	}



	async SetDisconnected() {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " disconnect - timer fired");
		if (this.DisconnectTimerID) {
			clearTimeout(this.DisconnectTimerID);
			this.DisconnectTimerID = null;
		}
		await this.Switch(false);
		await this.setRecommendationPowerConsumption(0);

		this.isConnected = false;
		//2023-03-11 added to inform SHM that device can't' be controlled because it's not connected
		this.deviceStatus.EMSignalsAccepted = false;
		this.Check3PhaseCharge(0);
		this.stopFastCharging();
		this.SetState();
	}

	setWallboxIsCharging(value) {
		//check type based and set value based
		const state = this.checkStateTypebased(this.device.WallboxOID.DeviceOIDIsCharging, value);
		this.Gateway.parentAdapter.log.debug(this.device.Name + " wallbox charging " + state);

		this.isCharging = value;

		this.SetState();
	}


	setWallboxIsError(value) {
		//check type based and set value based
		const state = this.checkStateTypebased(this.device.WallboxOID.DeviceOIDIsError, value);

		this.Gateway.parentAdapter.log.debug(this.device.Name + " wallbox error " + state);

		this.isError = value;

		this.SetState();
	}

	setMinEnergy(state) {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " wallbox got new min energy " + state);

		if (state >= 0) {
			if (this.planningrequest != null) {
				this.planningrequest.SetMinEnergy(state);
			}
		}
	}

	setMaxEnergy(state) {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " wallbox got new max energy " + state);

		if (state > 0) {
			if (this.planningrequest != null) {
				this.planningrequest.SetMaxEnergy(state);
			}
		}
	}

	CalcEnergy(watts) {
		const currentTimestamp = Date.now();
		if (this.EnergyData.lastTimestamp > 0) {

			const timeDiff = currentTimestamp - this.EnergyData.lastTimestamp;
			this.EnergyData.SumEnergy = this.EnergyData.SumEnergy + watts * timeDiff / 1000 / 60 / 60; //in Wh
			this.Gateway.parentAdapter.log.debug(this.device.Name + " calc energy " + watts + " " + this.EnergyData.lastTimestamp + " = " + this.EnergyData.SumEnergy + "Wh");

			if (this.logger != null) {
				const records = [];
				//hier records bauen
				const record = {
					Time: new Date().toLocaleString("de-DE"),
					DeviceId: this.device.ID,
					DeviceName: this.device.Name,
					Power: Math.round(watts),
					//LastTimeStamp: this.EnergyData.lastTimestamp,
					Timediff: timeDiff,
					Energy: Math.round(this.EnergyData.SumEnergy)
				};
				records.push(record);

				//und jetzt alle schreiben
				this.logger.WriteCSVLog(0, records);
			}
		}

		this.EnergyData.lastTimestamp = currentTimestamp;
	}

	//called by gateway
	async EnableFastCharging(state) {

		if (state) {
			if (this.isConnected) {

				if (this.isFastCharging) {
					this.Gateway.parentAdapter.log.debug(this.device.Name + " start fast charge ignored because already started");
				}
				else {
					this.Gateway.parentAdapter.log.info(this.device.Name + " start fast charging");

					//device on
					await this.Switch(true);

					//max power
					await this.setRecommendationPowerConsumption(Number(this.deviceInfo.Characteristics.MaxPowerConsumption));

					//3phase check
					this.Check3PhaseCharge(Number(this.deviceInfo.Characteristics.MaxPowerConsumption));

					this.isFastCharging = true;
					//2023-03-11 added to inform SHM that device can't' be controlled because it's in fast charge mode
					this.deviceStatus.EMSignalsAccepted = false;
					this.SetState();
				}
			}
			else {
				this.Gateway.parentAdapter.log.warn(this.device.Name + " fast charge cannot be started because EV is not connected");
			}
		}
		else {
			//disable fast charging
			if (this.isFastCharging) {

				this.stopFastCharging();

				this.setWallboxPlugConnected(this.isConnected);
			}
		}
	}

	SetMaxChargeTime(state) {
		this.Gateway.parentAdapter.log.debug(this.device.Name + " got new max charge time " + state);

		if (this.planningrequest != null) {
			const ret = this.planningrequest.SetMaxChargeTime(state);

		}
	}

	async GetMaxChargTime() {

		if (this.device.WallboxChargeTime != null && this.device.WallboxChargeTime == 4) {

			const key = "Devices." + this.device.Name + ".MaxChargeTime";
			const curVal = await this.Gateway.parentAdapter.getStateAsync(key);

			if (curVal != null) {
				this.SetMaxChargeTime(curVal.val);
			}
		}
	}

	stopFastCharging() {

		if (this.isFastCharging) {
			this.Gateway.parentAdapter.log.info(this.device.Name + " stop fast charging");
			this.isFastCharging = false;
			this.SetState();
		}
	}
}

module.exports = {
	Device
};