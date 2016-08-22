window.isochronos = (function() {
	"use strict";

	var map;
	var centerMarker;
	var CURSOR_OFFSET_X = 15;
	var CURSOR_OFFSET_Y = 10;

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