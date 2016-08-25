window.isochronos.getCalculator = function(){
	"use strict";

	var dependantMarkers = {
		baseMarkers: [],
		refinementMarkers: []
	}

	var STARTING_DISTANCE = 0.05;
	var SHIFTING_DISTANCE = 0.01;
	var ANGLE_STEPSIZE = 30;

	var UPPER_BOUND = 1.1;
	var LOWER_BOUND = 0.9;

	var directionsService = new google.maps.DirectionsService;
	var directionsRenderers = [];

	var currentCalculationTimeout = null;

	var finishedCallback = null;

	var calculatorFunction = function(centerMarker, map, transportRange){

		//this might fail on parts of the map where the projection distorts a lot :(
		//TODO: mit projection fixen
		var latLng = centerMarker.getPosition();
		var x = latLng.lng();
		var y = latLng.lat();

		for(var rho = 0; rho < 360; rho += ANGLE_STEPSIZE){
			var X = x + STARTING_DISTANCE * Math.cos(rho * Math.PI / 180);
			var Y = y + STARTING_DISTANCE * Math.sin(rho * Math.PI / 180);

			var newMarker = new google.maps.Marker({
							position: {lat: Y, lng: X},
							map: map,
							draggable: true,
							title: 'A - ' + rho,
							label: "a"
						});

			newMarker._isochronosInformation = {
				angle: rho,
				linearDistance: STARTING_DISTANCE,
				finished: false
			}

			dependantMarkers.baseMarkers.push(newMarker);
		}

		calculateRouteToAllBaseMarkers();
		return calculatorFunction;

		function drawOverlayFromMarkers(){
			var overlayCorners = [];

			for(var i = 0; i < dependantMarkers.baseMarkers.length; i++){
				var currentMarker = dependantMarkers.baseMarkers[i];

				var info = currentMarker._isochronosInformation;
				var endPoint = info.directionsFromCenter.routes[0].legs[0].end_location;
				overlayCorners.push(endPoint);

				var duration = info.directionsFromCenter.routes[0].legs[0].duration_in_traffic;
				if(typeof duration === "undefined")
					duration = info.directionsFromCenter.routes[0].legs[0].duration;

				if(typeof duration === "undefined")
					throw Error("TODO");

				info.directionsRenderer.setMap(null);
				currentMarker.setPosition(endPoint);
				currentMarker.setTitle("Duration to here: " + parseInt(duration.value/60) + ":" + duration.value%60);
			}

			// Construct the polygon.
			var newPolygon = new google.maps.Polygon({
				paths: overlayCorners,
				strokeColor: '#FF0000',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#FF0000',
				fillOpacity: 0.35
			});
			newPolygon.setMap(map);

			if(typeof finishedCallback === "function")
				finishedCallback();
		}

		function shiftBaseMarkers(){
			for(var i = 0; i < dependantMarkers.baseMarkers.length; i++){
				var currentMarker = dependantMarkers.baseMarkers[i];
				var info = currentMarker._isochronosInformation;

				var duration = info.directionsFromCenter.routes[0].legs[0].duration_in_traffic;
				if(typeof duration === "undefined")
					duration = info.directionsFromCenter.routes[0].legs[0].duration;

				if(typeof duration === "undefined")
					throw Error("TODO");

				var preShiftDistance = info.linearDistance;
				if(duration.value > transportRange * UPPER_BOUND * 60){
					info.linearDistance -= SHIFTING_DISTANCE;
					if(Math.abs(info.linearDistance - info.previousLinearDistance) <= SHIFTING_DISTANCE / 10){
						info.finished = true;
						continue;
					}
				}else if(duration.value < transportRange * LOWER_BOUND * 60){
					info.linearDistance += SHIFTING_DISTANCE;
					if(Math.abs(info.linearDistance - info.previousLinearDistance) <= SHIFTING_DISTANCE / 10){
						info.finished = true;
						continue;
					}
				}else{
					info.finished = true;
					continue;
				}
				info.previousLinearDistance = preShiftDistance;

				var X = x + info.linearDistance * Math.cos(info.angle * Math.PI / 180);
				var Y = y + info.linearDistance * Math.sin(info.angle * Math.PI / 180);

				currentMarker.setPosition({lat: Y, lng: X});
				currentMarker._isochronosInformation.directionsRenderer.setMap(null);
			}

			for(var i = 0; i < dependantMarkers.baseMarkers.length; i++){
				var currentMarker = dependantMarkers.baseMarkers[i];

				if(!currentMarker._isochronosInformation.finished){
					console.log("Marker number " + i + " is not yet finished", currentMarker);
					calculateRouteToAllBaseMarkers();
					return;
				}
			}

			//when we reach this point, no marker is not finished
			drawOverlayFromMarkers();
		}

		function calculateRouteToAllBaseMarkers(markerIndex){
			if(typeof markerIndex === "undefined")
				markerIndex = 0;

			if(markerIndex >= dependantMarkers.baseMarkers.length){
				window.setTimeout(shiftBaseMarkers, 0);
				return;
			}

			//rate limiting
			currentCalculationTimeout = window.setTimeout(function(){
				var currentMarker = dependantMarkers.baseMarkers[markerIndex];

				if(currentMarker._isochronosInformation.finished){
					//trigger planning of next route (with rate limiting)
					calculateRouteToAllBaseMarkers(markerIndex + 1);
					return;
				}

				//calculate route to a single marker
				directionsService.route({
						origin: centerMarker.getPosition(),
						destination: currentMarker.getPosition(),
						travelMode: google.maps.TravelMode.DRIVING
					}, function(response, status) {
						//Draw the responst
						if (status === google.maps.DirectionsStatus.OK) {
							var renderer = new google.maps.DirectionsRenderer({map: map, preserveViewport: true})
							renderer.setDirections(response);
							directionsRenderers.push(renderer);

							currentMarker._isochronosInformation.directionsFromCenter = response;
							currentMarker._isochronosInformation.directionsRenderer = renderer;
						} else {
							window.alert('Directions for index = ' + markerIndex + 'request failed due to ' + status, currentMarker);
						}

						//trigger planning of next route (with rate limiting)
						calculateRouteToAllBaseMarkers(markerIndex + 1);
					}
				);
			}, 750);
		}
	}

	calculatorFunction.done = function(callback){
		finishedCallback = callback;
	}

	return calculatorFunction;
}