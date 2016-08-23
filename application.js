window.isochronos = (function() {
	"use strict";

	var map;
	var centerMarker;
	var dependantMarkers = {
		baseMarkers: [],
		refinementMarkers: []
	}
	var directionsService;
	var directionsRenderers = [];

	var currentCalculationTimeout = null;

	var CURSOR_OFFSET_X = 15;
	var CURSOR_OFFSET_Y = 10;

	var STARTING_DISTANCE = 0.05;
	var SHIFTING_DISTANCE = 0.01;
	var ANGLE_STEPSIZE = 30;

	var UPPER_BOUND = 1.1;
	var LOWER_BOUND = 0.9;

	var uiElems;

	function init(apiKey){
		uiElems = {
			settingsArea: $("#settings-area"),
			toastElem: $("#toast"),
			mapContainer: $("#map-container"),
			mapElem: $("#map"),
			newLocationMarker: $("#newLocationMarker")
		}

		document.write('<script src="https://maps.googleapis.com/maps/api/js?key=' + apiKey + '&callback=isochronos.initMap" async defer></' + 'script>');
	}

	/**
	 * Initialises the google map, zooms to a good standard location,
	 * requests user location and triggers the initialization of the rest of the gui.
	 */
	function initMap() {
		//wait for MDL to settle
		window.setTimeout(function(){
			map = new google.maps.Map(uiElems.mapElem[0], {
				center: {lat: 49.58882244495942, lng: 11.032677263021474},//{lat: 32, lng:-13},
				zoom: 9, //3,
				minZoom: 3 //TODO: Beim rauszoomen checken, dass nicht bounds [-180, 180] degrees (mehr als eine welt sichtbar)
			});

			//Ask user location right after this function
			window.setTimeout(function(){
				if (navigator.geolocation) {
					navigator.geolocation.getCurrentPosition(function(position) {
						var pos = {
							lat: position.coords.latitude,
							lng: position.coords.longitude
						};

						map.setCenter(pos);
						map.setZoom(9);
					});
				}
			}, 0);

			directionsService = new google.maps.DirectionsService;

		}, 500);

		//now we can initialise the rest of the gui
		initUI();
	}


	/**
	 * Initialises the ui elements, setting callbacks etc.
	 */
	function initUI(){
		uiElems.settingsArea.find("button").removeAttr('disabled');
		uiElems.settingsArea.delegate("button", "click", addNewOverlay);

		uiElems.newLocationMarker
				.draggable({ containment: "#application-container",
				             cursorAt: {top: CURSOR_OFFSET_Y, left: CURSOR_OFFSET_X},
				             appendTo: "body",
				             helper: "clone"
				})
				.on("dragstart", function() {
					uiElems.newLocationMarker.css({visibility: "hidden"});
				})
				.on("dragstop", addMarkerAtMousePosition);

		uiElems.settingsArea.find(".transport-range").change(function(){
			$(this).parent().next().text(this.value);
		})

	}


	/**
	 * Adds a new marker to the map and sets it up to display its location in the left sidebar
	 *
	 * @param {google.maps.LatLng} latLng - the coordinates to add the marker add
	 */
	function addNewMarker(latLng){
		centerMarker = new google.maps.Marker({
							position: latLng,
							map: map,
							draggable: true,
							title: 'Center A',
							label: "A"
						});

		$("#settings-area .settings-widget:first-of-type .location-text").text(latLng.toString());
		uiElems.settingsArea.find(".settings-widget:first .settings .location").removeClass("unset");
		centerMarker.addListener("dragend", function(event){
			$("#settings-area .settings-widget:first-of-type .location-text").text(event.latLng.toString());
		});
	}

	/** Adds a marker to the map at the mouse position (if the mouse is positioned over the map)
	 *
	 * @param {jQuery.event} event - a jquery mouse event
	 */
	function addMarkerAtMousePosition(event){
		var x = event.pageX;
		var y = event.pageY;

		var mapX = uiElems.mapContainer.offset().left;
		var mapY = uiElems.mapContainer.offset().top;
		var mapH = uiElems.mapContainer.height();
		var mapW = uiElems.mapContainer.width();

		if(x > mapX && x < mapX + mapW && y > mapY && y < mapY + mapH){
			//correct for the size of the marker
			var correctedX = event.pageX - CURSOR_OFFSET_X + uiElems.newLocationMarker.width() / 2;
			var correctedY =  event.pageY - CURSOR_OFFSET_Y + uiElems.newLocationMarker.height() - 5; //TODO: woher kommt die 5?

			addNewMarker(offsetToLatLng(x, y));
			uiElems.newLocationMarker.hide();
		} else {
			uiElems.newLocationMarker.css({visibility: "visible"});
		}
	}

	function addNewOverlay(){
		var firstWidget = uiElems.settingsArea.find(".settings-widget:first");
		var isLocationSet = !firstWidget.find(".settings .location").hasClass("unset");
		var transportRange = parseInt(firstWidget.find(".transport-range").val());

		if(!isLocationSet){
			showToast("Please drag the location marker on the map first");
			return;
		}

		firstWidget.find(".add-button").hide();
		firstWidget.find(".add-spinner").show();


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
			var bermudaTriangle = new google.maps.Polygon({
				paths: overlayCorners,
				strokeColor: '#FF0000',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#FF0000',
				fillOpacity: 0.35
			});
			bermudaTriangle.setMap(map);

			firstWidget.find(".add-spinner").hide();
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
			window.setTimeout(function(){
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


	/*
	 * Begin utility functions
	 */

	/**
	 * Converts an offset (x, y coordinates relative to document) to a `google.maps.LatLng` object
	 * The callee must make sure that the offset lies within the map-div.
	 *
	 * @param {number} x - offset in x-direction (i.e. from the left)
	 * @param {number} y - offset in y-direction (i.e. from the top)
	 */
	function offsetToLatLng(x, y){
		  // retrieve the lat lng for the far extremities of the (visible) map
		  var latLngBounds = map.getBounds();
		  var neBound = latLngBounds.getNorthEast();
		  var swBound = latLngBounds.getSouthWest();

		  // convert the bounds in pixels
		  var neBoundInPx = map.getProjection().fromLatLngToPoint(neBound);
		  var swBoundInPx = map.getProjection().fromLatLngToPoint(swBound);

		  // compute the percent of x and y coordinates related to the div containing the map; in my case the screen
		  var procX = (x-uiElems.mapElem.offset().left)/uiElems.mapElem.width();
		  var procY = (y-uiElems.mapElem.offset().top)/uiElems.mapElem.height();

		  // compute new coordinates in pixels for lat and lng;
		  // for lng : subtract from the right edge of the container the left edge,
		  // multiply it by the percentage where the x coordinate was on the screen
		  // related to the container in which the map is placed and add back the left boundary
		  // you should now have the Lng coordinate in pixels
		  // do the same for lat
		  var newLngInPx = (neBoundInPx.x - swBoundInPx.x) * procX + swBoundInPx.x;
		  var newLatInPx = (swBoundInPx.y - neBoundInPx.y) * procY + neBoundInPx.y;

		  // convert from google point in lat lng and have fun :)
		  return map.getProjection().fromPointToLatLng(new google.maps.Point(newLngInPx, newLatInPx));
	}

	/**
	 * Shows a message in a Toast-Widget
	 *
	 * @param {string} text - the text to display
	 */
	function showToast(text){
		uiElems.toastElem[0].MaterialSnackbar.showSnackbar({message: text});
	}

	return {
		init: init,
		initMap: initMap
	}
})();