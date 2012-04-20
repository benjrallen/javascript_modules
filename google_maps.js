/**	This is a jQuery-based Google Maps module
 *	It gets its marker data as stringified JSON
 *	from the data attribute of elements 
 *	defined in the configuration
 **/

/** EXAMPLE USAGE

	new Ease.Map({
		streetViewControl: true,
		fitMarkers: false,
		zoom: 15,
		centerLat: 36.14808,
		centerLng: -95.90731,
		mapHeight: 206,
		contId: 'miniGmap',
		dataCont: '#miniMap .locationList', //specify the container id so it doesn't pick up all the location lists around the page
		locationKey: 'address',
		markerScale: 0.4,
		markerOverridesCenter: true,
		globalInitId: 'miniMapInit'
	});

**/


//ns
var Ease = Ease || {};

(function($){

	Ease.loadingGoogle = false;

	//google maps custom integration
	Ease.Map = function(config){
		//default configurable variables
		var me = this,
			defaults = {
				zoom: 4,
				//center on Salina kansas for good full us view
				centerLat: 38.7902935,
				centerLng: -97.64023729999997,
				mapHeight: 500,
				fitMarkers: false, //fit all the markers on the map?  overrides centerLatLng and zoom
				markerOverridesCenter: false,
				contId: 'gmapCont',
				dataCont: '.locationList',
				dataBlock: '.locationItem',
				dataAttr: 'location-data',
				locationKey: 'location_address',
				fallbackLocationKey: 'mailing_address',
				fallbackOverrideKey: false, //set as post meta to prefer the secondary address as the marker address
				markerImageKey: false,
				zoomControlStyle: 'DEFAULT',
				streetViewControl: false,
				scrollwheel: false,
				mapTypeId: 'ROADMAP',
				markerScale: 0.5,
				blocksAreClickable: false,
				scrollToMapOnClick: false,
				scrollSpeed: 500,
				directionsLink: false,
				globalInitID: 'EaseMapInit' //used to expose the setupConstants (used in init) function globally for googles async callback... change this to something unique for each instance running
			};
		for (var key in config) {
			defaults[key] = config[key] || defaults[key];
		}
		for (var key in defaults) {
			me[key] = defaults[key];
		}

		me.setupConstants = function(){
			
			if ( typeof google !== 'undefined' && typeof google.maps !== 'undefined' && typeof google.maps.InfoWindow !== 'undefined' ) {
				//remove global access to this setup function
				if ( window[me.globalInitID] )
					window[me.globalInitID] = undefined;
	
				//constants
				Ease.loadingGoogle = false;
				me.infowindow = new google.maps.InfoWindow();
				me.directionsService = new google.maps.DirectionsService();
				me.directionsDisplay = new google.maps.DirectionsRenderer();
				//keep that map out of it for now.
				me.directionsDisplay.setMap( null );
				//geocoder used to take address and convert it to latLng and make marker
				me.geocoder = new google.maps.Geocoder();
				me.center = null;
				me.cont = null;
				me.map = null;
				me.form = null;
				me.startAddy = '';
				me.endAddy = '';
				me.currentRoute = null;
				me.confirmBttn = null;
				me.dblclickListener = null;
	
				me.data = [];
				me.markers = [];
	
				me.init();
	
			} else {
				//if google's maps api does not exist, make a call for it with this function as the callback
				//	only do this if no other instance of this module has already made that call.
				if (!Ease.loadingGoogle) {
					Ease.loadingGoogle = true;
	
					//make this setup function available globally
					window[me.globalInitID] = me.setupConstants;
	
					var script = document.createElement("script");
					script.type = "text/javascript";
					script.src = "http://maps.googleapis.com/maps/api/js?sensor=false&callback="+me.globalInitID;
					document.body.appendChild(script);
				} else {
					setTimeout( me.setupConstants, 50 );
				}
			}
			
		};

		me.handleBlockClick = function(e){			
			//find associated marker, and setup the coords like google does
			var marker = me.markers[ $(this).attr('markerIndex') ],
				coords = { latLng: marker.position };
	
			me.handleMarkerClick.apply( marker, [coords] );
	
			//move page up to see map?
			if ( me.scrollToMapOnClick ){
				//finding the target element is not 'smart' (enough) right now, make it smarter later.
				var target = $(me.cont).closest('section'),
					off = target.offset(),
					//different browsers use different elements to calculate the scrolltop ( webkit=body, mozilla=html, par example )
					sTop = $('body').scrollTop() || $('html').scrollTop();
	
				if( sTop > off.top )
					$('html, body').stop(false, false).animate({ scrollTop: off.top }, me.scrollSpeed );
	
				target = null;
				off = null;
			}
	
			return;
		};
		
		//puts the elements from the list item that provided the marker's address 
		//	into the indo window on marker or list item click
		me.handleMarkerClick = function( coords ){	
			var content = '<div class="mapInfoDom">'+$(this.item.DOM).html();
	
			//here is where we print out a directions link
			if (me.directionsLink) {
				var addy = this.item[me.locationKey].replace(/ /g,'+').replace(/\n/g,',+'),
					dUrl = 'http://maps.google.com/maps?saddr=&daddr='+addy
	
				content += '<a class="directionsLink" href="'+dUrl+'" title="Get directions to this site" target="_blank">Get Driving Directions</a>';
			}
	
			content += '</div>';
		
			me.infowindow.setContent( content );
	
			me.infowindow.open(me.map, this);
		};

		//check for google.maps and then set up all the data before calling init
		me.setupConstants();
	};

	Ease.Map.prototype.init = function(){
		//gather data from page elements
		this.setupMarkerData();
		//setup the map and initialize it.
		this.setupMap();
		//setup markers
		this.setupMarkers();
	};

	Ease.Map.prototype.setupMap = function(){
		var me = this;
		//find the container
		me.cont = document.getElementById( me.contId );

		//check dimensions
		if ( !$(me.cont).height() )
			$(me.cont).height( me.mapHeight );

		//set the google center
		me.center = new google.maps.LatLng( me.centerLat, me.centerLng );

		//get the map
		me.map = new google.maps.Map( me.cont, {
			center: me.center,
			zoom: me.zoom,
			zoomControlOptions: {
				style: google.maps.ZoomControlStyle[ me.zoomControlStyle ]
			},
			streetViewControl: me.streetViewControl,
			scrollwheel: me.scrollwheel,
			mapTypeId: google.maps.MapTypeId[ me.mapTypeId ]
		});
	};

	Ease.Map.prototype.setupMarkers = function(){
		var me = this;
		
		if ( me.data.length ) {
			//start bounds here for fitmarkers option later down
			var latLngBounds = new google.maps.LatLngBounds();

			//iterate through markers
			$.each(me.data, function(i){

				var dataObj = this,
					address = ( me.fallbackOverrideKey && dataObj[ me.fallbackOverrideKey ] && dataObj[ me.fallbackLocationKey ] ?
									//if so, use the fallback key
									dataObj[ me.fallbackLocationKey ] :
									//otherwise, if there is no preference, try to use the primary key, and then fallback if it is not there
									dataObj[ me.locationKey ] || dataObj[ me.fallbackLocationKey ]
								);

				if ( address ) {
					me.geocoder.geocode({
						address: me.stripTags( address )
					}, function(results, status){
						
						if (status === google.maps.GeocoderStatus.OK) {
							
							me.markers[i] = new google.maps.Marker({
								map: me.map,
								position: results[0].geometry.location,
								item: dataObj
							});

							//add a custom marker image?
							if ( me.markerImageKey && dataObj[ me.markerImageKey ] ){
								var img = dataObj[ me.markerImageKey ],
									src = img['src'],
									w = Math.floor( img.width * me.markerScale ),
									h = Math.floor( img.height * me.markerScale );
								
								me.markers[i].setIcon( 
									new google.maps.MarkerImage(
										//url
										dataObj[ me.markerImageKey ].src,
										//original image size ( width, height )
										new google.maps.Size( w, h ),
										//origin in image ( left, top ), (0,0) is google default
										new google.maps.Point( 0, 0 ),
										//anchor point
										new google.maps.Point( w/2, h/2 ),
										new google.maps.Size( w, h )
									)
								);

								w = null; h = null; src = null; img = null;
							}

							//bind the click listener
							google.maps.event.addListener( me.markers[i], 'click', me.handleMarkerClick );

							//attach same click handler to block if set
							if ( me.blocksAreClickable )
								$(dataObj.DOM).attr({ markerIndex: i }).mousedown( me.handleBlockClick ).find('a').click(me.preventBlockLinks);

							if (me.fitMarkers) {
								//extend the auto bounds
								latLngBounds.extend( me.markers[i].position );
								me.map.fitBounds( latLngBounds );
							}
							
							//reset the center if the overrides exist.  came in dolphin project
							if( me.markerOverridesCenter && dataObj.center_lat && dataObj.center_lng )
								me.map.setCenter( new google.maps.LatLng( dataObj.center_lat, dataObj.center_lng ) );

						} else {
							//something went wrong.
							alert("Geocode was not successful for the following reason: " + status);
						}
					});
				}

			});
		}
	};

	Ease.Map.prototype.preventBlockLinks = function(e){
		e.preventDefault();
	};
	
	Ease.Map.prototype.setupMarkerData = function(){
		var me = this;	
		//dataBlock supplied in config
		return $(me.dataCont).find(me.dataBlock).each(function(){
			var item = JSON.parse( $(this).attr( me.dataAttr ) );
			item.DOM = this;
			me.data.push( item );
		});
	};

	//clean any html from the marker address and replace newlines with a space for geocoding
	Ease.Map.prototype.stripTags = function(s){
		//s = String
		if (typeof s !== 'string')
			return false;
		return s.replace(/<([^>]+)>/g,'').replace(/\n|\r/g,' ');
	};

})(jQuery);