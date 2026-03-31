var Main = /** @class */ (function () {

  function Main() {
  }

  Main.init = function (modUrl) {
    let busUrl = modUrl + "&method=getBuses";
    let routeUrl = modUrl + "&method=getRoutes";
    let patternUrl = modUrl + "&method=getRoutePatterns";
    let patternPointsUrl = modUrl + "&method=getPatternPoints";
    let nextDeparturesForStopUrl = modUrl + "&method=getNextDeparturesForStop";
    let alertUrl = modUrl + "&method=getActiveAlerts";

    var _this = this;
    /*"https://osm.aciwebs.com/osm_tiles/{z}/{x}/{y}.png"*/
    Main.mainTileLayer = L.tileLayer("https://osm.ridebt.org/hot/{z}/{x}/{y}.png", {
      waypointMode: "snap",
      maxZoom: 18
    }).addTo(Main.map);

    Main.patternPointsUrl = patternPointsUrl;
    Main.nextDeparturesForStopUrl = nextDeparturesForStopUrl;

    //var updating = false;

    data.Routes.load(routeUrl, function (rx) {
      Main.routes = rx.data;

      _this.setupDropDown();
    });

    data.Patterns.load(patternUrl, function (patternsJson) {
      // Get list of pattern names from patternsJson
      patternsJson.data.forEach(function (patternJson) {
        var pattern = models.Pattern.fromJSON(patternJson);
        //console.log(pattern.routeId, pattern.name);
        Main.patterns[pattern.name] = pattern;
      });

    });

    data.Buses.load(busUrl, function (busesJson) {
      busesJson.data.forEach(function (busJson) {
        var bus = models.Bus.fromJSON(busJson);
        Main.buses.push(bus);
      });

      Main.draw();

      /*
      var animationInterval = setInterval(function () {
          if (!updating) {
              Main.draw();
          }
      }, 1000);
      */
    });

    data.Alerts.load(alertUrl, function (response) {
      Main.alerts = response.data;
    })


    var interval = setInterval(function () {
      data.Buses.load(busUrl, function (rx) {
        _this.buses = [];
        rx.data.forEach(function (b) {
          var bus = models.Bus.fromJSON(b)
          _this.buses.push(bus);
        });

        Main.draw();
        //updating = false;
        Main.map.invalidateSize(true);
      });
    }, 1000);
    //}, 30000);


    Main.map.invalidateSize(true);
  };

  Main.setupDropDown = function () {
    Main.legend = new L.Control({ position: 'topright' });
    Main.legend.onAdd = function (map) {
      var div = L.DomUtil.create('div', 'info legend');
      div.innerHTML = '<select class="form-control" id="selRoute"><option>-Select a Route-</option></select>';
      return div;
    };
    Main.legend.addTo(Main.map);

    // Turn routes into an array
    routes = Array();
    for (var routeId in Main.routes) {
      routes.push(Main.routes[routeId][0]);
    }

    // Sort rourets by name
    routes = routes.sort(function (r1, r2) {
      if (r1.routeName > r2.routeName)
        return 1;
      if (r1.routeName < r2.routeName)
        return -1;
      return 0;
    });

    Main.sel = jQuery('#selRoute')[0];
    routes.forEach(function (route) {
      if (route != null) {
        //console.log(route);
        Main.sel.add(new Option(route.routeName, route.routeShortName));
      }
    });


    //register change listener
    jQuery("html").focus();
    jQuery('#selRoute').live("change", function (event) {
      var rsel = jQuery('#selRoute').val();
      var route = Main.routes[rsel][0]

      Main.removePolyline();

      // Find patterns for buses on this route
      var busPatterns = new Object();
      Main.buses.forEach(function (bus) {
        if (rsel.indexOf(bus.routeId) != -1) {
          busPatterns[bus.patternName] = true;
        }
      });

      for (var patternId in Main.patterns) {
        var pattern = Main.patterns[patternId];
        if (rsel.indexOf(pattern.routeId) == -1) {
          continue;
        }
        // Draw solid lines for active patterns
        var active = busPatterns[patternId];
        Main.addPolyline(patternId, route, !active);
      };

      if (Main.polylines.length > 0) {
        var bounds = Main.polylines[0].getBounds();
        for (i = 1; i < Main.polylines.length; i++) {
          var b = Main.polylines[i].getBounds();
          bounds.extend(b._northEast);
          bounds.extend(b._southWest);
        }
        Main.map.fitBounds(bounds);
      }

      jQuery("html").focus();
    });
    Main.map.invalidateSize(true);
  };

  Main.draw = function () {
    var now = Date.now()
    for (i = 0; i < Main.buses.length; i++) {
      var bus = Main.buses[i];
      if (bus && bus.states && bus.states.length !== 0) {
        Main.updateBus(bus, now);
      } else {
        //alert("Removing bus " + i);
        Main.removeBusMarker(bus);
      }
    }
    Main.map.invalidateSize(true);
  };

  Main.updateBus = function (bus, now) {
    var dt = new Date(now - 60000);

    // Find before and after state
    var before = void 0;
    var after = void 0;
    bus.states.forEach(function (state) {
      var t = new Date(state.version);
      if (t.getTime() > dt.getTime()) {
        after = state;
        return;
      }
      before = state;
    });

    var currState;

    if (before == null) {
      currState = after;
    } else if (after == null) {
      currState = before;
    } else {
      bus.calcCurrState(before, after, dt);
      currState = bus.currState;
    }

    if (!currState.latitude || !currState.longitude) {
      //alert(bus.routeId + " state missing lat or lon");
      return;
    }

    var hasAlert = false;

    Main.alerts.forEach((alert) => {
      const { affected } = alert;
      if (affected && affected.contains(bus.routeId)) {
        hasAlert = true;
      }
    })

    var busMarker = Main.bus_markers[bus.id];
    if (busMarker) {
      busMarker.setLatLng(new L.LatLng(currState.latitude, currState.longitude));
      var popup = "";
      const busCapacityImageFileName = "../../images/bus-capacity/bus-capacity-" + (bus.percentOfCapacity / 10).toFixed(0) + ".png"

      popup += "<img class='bus-capacity-icon' src='" + busCapacityImageFileName + "' style='width: 100px; height:25px;' /><br /><br />";

      if (hasAlert) {
        popup += "<img class='route-alert' src='../../images/icon-alert.png' style='width: 25px; height:25px;' /><b>Active Alert</b><br /><br />"
      }

      popup += (
        "<b>Route:</b> " + routeBox(Main.routes[bus.routeId][0]) + "<br />" +
        "<b>Bus Number:</b> " + bus.id + "<br />" +
        "<b>Passengers:</b> " + bus.capacity + " (" + bus.percentOfCapacity + "%)<br />" +
        "<b>Last stop:</b> " + bus.stopId + "<br />" +
        "<b>Last Updated:</b> " + new Date(currState.version).toLocaleString() + "<br />" +
        "<a href='/index.php/routes-schedules?route=" + bus.routeId + "'>View Route/Schedule details</a>");
      busMarker.bindPopup(popup);
      //"<b>Speed:</b> " + currState.speed + " " +
      //"<b>Direction:</b> " + Math.floor(currState.direction) + "<br />" +
      //"<b>States:</b> " + bus.states.length) + 
    } else {
      busMarker = Main.addBusMarker(bus, currState);
      Main.bus_markers[bus.id] = busMarker;
    }
  };

  Main.addBusMarker = function (bus, state) {
    var m = L.marker([state.latitude, state.longitude]);
    var isClicked = false;

    if (!Main.routes[bus.routeId]) {
      //alert("No route " + bus.routeId + " " + bus.patternName);
      return;
    }
    var route = Main.routes[bus.routeId][0];

    m.bindPopup(
      "<b>Route:</b> " + bus.routeId + "<br />" +
      "<b>Pattern:</b> " + bus.patternName + "<br />" +
      "<b>Passengers:</b> " + state.passengers + " (" + bus.capacity + "%)<br />" +
      "<b>Last stop:</b> " + bus.stopId + "<br />" +
      "<b>Last Updated:</b> " + new Date(state.version).toLocaleString() + "<br />" +
      "<a href='/index.php/routes-schedules?route=" + bus.routeId + "'>View Route/Schedule details</a>");

    m.on("click", function (e) {
      Main.selected_bus_id = bus.id;
      Main.removePolyline();
      Main.addPolyline(bus.patternName, route);
    });

    // https://stackoverflow.com/questions/13494649/rotate-marker-in-leaflet
    electric_buses = ['7005', '7006', '7007', '7021', '7022'];
    m.setIcon(L.icon({
      iconUrl: "/media/mod_bt_map/img/" + route.routeColor + ((electric_buses.indexOf(bus.id) > -1) ? "_electric" : "") + ".png",
      iconSize: [16, 16],
      shadowSize: [0, 0],
      //iconAnchor: [0, 0],
      popupAnchor: [0, 0] // point from which the popup should open relative to the iconAnchor
    }));

    m.on({
      mouseover: function () {
        if (!isClicked) {
          this.openPopup();
        }
      },
      mouseout: function () {
        if (!isClicked) {
          this.closePopup();
        }
      },
      click: function () {
        isClicked = true;
        this.openPopup();
      }
    })
    Main.map.on({
      click: function () {
        isClicked = false;
      },
      popupclose: function () {
        isClicked = false;
      }
    })
    m.addTo(Main.map);

    return m;
  }

  Main.removeBusMarker = function (bus) {
    var m = Main.bus_markers[bus.id];
    var key = bus.id;
    Main.map.removeLayer(m);
    Main.bus_markers.splice(Main.bus_markers.indexOf({ key: m }), 1);
  };

  Main.removePolyline = function () {
    // clear the old poly line
    Main.polylines.forEach(function (polyline) {
      Main.map.removeLayer(polyline);
    });
    Main.stop_markers.forEach(function (marker) {
      Main.map.removeLayer(marker);
    });
    Main.polylines = []; //new Array();
  };

  Main.addPolyline = function (patternId, route, dash = false, retrieved = false) {
    const selected_pattern = Main.patterns[patternId];
    if (!selected_pattern) {
      return;
    }

    if (selected_pattern.points.length === 0) {
      data.PatternPoints.load(Main.patternPointsUrl, patternId, function (patternPointsJson) {
        selected_pattern.points = patternPointsJson.data;
        //console.log("called back", patternPointsJson);

        if (selected_pattern.points.length > 0) {
          Main.addPolyline(patternId, route, dash, true);
        }
      });
      return;
    }

    //Draw selected route
    const polyline = Main.pattern_polyline(selected_pattern, route, dash);
    polyline.addTo(Main.map);
    Main.polylines.push(polyline);

    const stops = Main.pattern_stop_markers(selected_pattern, route);
    stops.forEach(function (marker) {
      marker.addTo(Main.map);
      Main.stop_markers.push(marker);
    });

    if (retrieved) {
      Main.map.fitBounds(polyline.getBounds());
    }
  };

  Main.pattern_polyline = function (pattern, route, dash = false) {
    var pointArray = new Array();
    pattern.points.forEach(function (point) {
      pointArray.push([point.latitude, point.longitude]);
    });

    var polyline = L.polyline(pointArray, {
      color: "#" + route.routeColor,
      weight: 3,
      dashArray: dash ? "10, 10" : "",
      opacity: .8,
      smoothFactor: 1
    });

    /* You can get here by clicking on link in popup
    polyline.on("click", function (e) {
        window.location.href = "/index.php/routes-schedules?route=" + routeId;
    });
    */

    return polyline
  }

  Main.pattern_stop_markers = function (pattern, route) {
    var stop_markers = new Array();
    var color = "#" + route.routeColor

    pattern.points.forEach(function (point) {
      if (point.isBusStop != "Y") {
        return;
      }
      var pointLatLng = L.latLng(point.latitude, point.longitude);
      var marker = L.circleMarker(pointLatLng, {
        color: color,
        radius: 3,
        fillColor: color,
        fillOpacity: 0.75
      }
      )
      stop_markers.push(marker)

      var title = point.patternPointName + ' (#' + point.stopCode + ')';

      var pointTooltip = L.tooltip().setLatLng(pointLatLng);
      pointTooltip.setContent(title);
      marker.bindTooltip(pointTooltip);
      marker.on('mouseover', function (e) { this.openTooltip(); });
      marker.on('mouseout', function (e) { this.closeTooltip(); });

      var pointPopup = L.popup().setLatLng(pointLatLng);
      marker.bindPopup(pointPopup);
      marker.on('click', () => {
        jQuery.post({
          url: Main.nextDeparturesForStopUrl,
          data: {
            stopCode: point.stopCode,
            numOfTrips: 3
          },
          success: (response) => {
            createPopup(response.data, title, marker);

            marker.getPopup().on("remove", () => {
              const id = "#stopTableRow" + point.stopCode;
              jQuery(id).removeClass("success");
            });

            marker.openPopup();
            maker.closeTooltip();
          }
        });
      });

    });
    return stop_markers;
  }

  const createPopup = (departures, title, marker) => {
    var popupContent = '<p><strong>' + title + '</strong></p>';
    popupContent += '<p>Next Depatures:</p>';
    popupContent += '<ul>';

    departures.forEach((departure) => {
      const departureTime = moment(departure.adjustedDepartureTime);
      popupContent += '<li>' + departure.routeShortName + ": " + departureTime.format('hh:mm A') + '</li>';
    })
    popupContent += '</ul>';

    var pointPopup = L.popup().setLatLng(marker.getLatLng());
    pointPopup.setContent(popupContent);

    marker.bindPopup(pointPopup);
  }

  function routeBox(route) {
    boxStyles = 'margin-left: 5px; margin-bottom: 2px; text-align: center; min-width: 25px; outline: 3px solid #' + route.routeColor + '; background-color: #' + route.routeColor + '; color: white; ' + 'display: inline-block;';
    return(
      `<div class='route-color-box' id='route-color-box-${route.routeShortName}' style='${boxStyles}'>` +
      `<b>${route.routeShortName}</b>` +
      `</div>`
    );
  }

  // Properties
  Main.buses = new Array();
  Main.patterns = new Object();
  Main.routes = new Array();
  Main.map = L.map("bt_map").setView(new L.LatLng(37.2274, -80.4222), 13);
  Main.bus_markers = new Array();
  Main.polylines = new Array();
  Main.stop_markers = new Array();
  Main.alerts = new Array();
  return Main;
}());


var data;
(function (data) {
  var Buses = /** @class */ (function () {
    function Buses() {
    }
    Buses.load = function (url, cb) {
      util.Ajax.sendAjaxRequest("POST", url, "", cb);
    };
    return Buses;
  }());
  data.Buses = Buses;
})(data || (data = {}));

var data;
(function (data) {
  var Alerts = /** @class */ (function () {
    function Alerts() {
    }
    Alerts.load = function (url, cb) {
      util.Ajax.sendAjaxRequest("POST", url, "", cb);
    };
    return Alerts;
  }());
  data.Alerts = Alerts;
})(data || (data = {}));


var data;
(function (data) {
  var Patterns = /** @class */ (function () {
    function Patterns() {
    }
    Patterns.load = function (url, cb) {
      util.Ajax.sendAjaxRequest("POST", url, "", cb);
    };
    return Patterns;
  }());
  data.Patterns = Patterns;
})(data || (data = {}));


var data;
(function (data) {
  var PatternPoints = /** @class */ (function () {
    function PatternPoints() {
    }
    PatternPoints.load = function (url, patternName, cb) {
      //console.log("request: " + patternName);
      util.Ajax.sendAjaxRequest("POST", url + "&patternName=" + patternName, "", cb);
    };
    return PatternPoints;
  }());
  data.PatternPoints = PatternPoints;
})(data || (data = {}));


var data;
(function (data) {
  var Routes = /** @class */ (function () {
    function Routes() {
    }
    Routes.load = function (url, cb) {
      util.Ajax.sendAjaxRequest("POST", url, "", cb);
    };
    return Routes;
  }());
  data.Routes = Routes;
})(data || (data = {}));


var models;
(function (models) {
  var Bus = /** @class */ (function () {
    function Bus() {
      this.states = new Array();
    }

    Bus.prototype.calcCurrState = function (before, after, updateTime) {
      this.currState = models.BusState.interpolate(before, after, updateTime);
    };

    Bus.fromJSON = function (json) {
      var bus = Object.create(Bus.prototype);
      return Object.assign(bus, json, {
        id: json.id,
        routeId: json.routeId,
        stopId: json.stopId,
        patternName: json.patternName,
        capacity: json.capacity,
        tripStartOn: json.tripStartOn,
        gtfsTripId: json.gtfsTripId,
        gtfsBlockId: json.gtfsBlockId,
        states: Bus.getStates(json)
      });
    };

    Bus.getStates = function (json) {
      var st = new Array();
      json.states.forEach(function (bs) {
        st.push(models.BusState.fromJSON(bs));
      });
      return st;
    };

    return Bus;
  }());
  models.Bus = Bus;
})(models || (models = {}));


var models;
(function (models) {
  var BusState = /** @class */ (function () {
    function BusState(s) {
      this.direction = s.direction;
      this.speed = s.speed;
      this.passengers = s.passengers;
      this.isTimePoint = s.isTimePoint;
      this.isTripper = s.isTripper;
      this.isBusAtStop = s.isBusAtStop;
      this.latitude = s.latitude;
      this.longitude = s.longitude;
      this.realtimeLatitude = s.realtimeLatitude;
      this.realtimeLongitude = s.realtimeLongitude;
      this.patternPointId = s.patternPointId;
      this.isProjected = s.isProjected;
      this.isGenerated = s.isGenerated;
      this.version = s.version;
    }

    BusState.prototype.point = function () {
      return new models.Vector2(this.longitude, this.latitude);
    };

    BusState.prototype.setPoint = function (point) {
      this.latitude = point.y;
      this.longitude = point.x;
    };

    BusState.milliSecondsBetween = function (before, after) {
      return after.version - before.version;
    };

    BusState.interpolate = function (before, after, updateTime) {
      var result = new BusState(before);
      result.version = updateTime.getTime();
      var fraction;
      fraction = BusState.milliSecondsBetween(before, result) / BusState.milliSecondsBetween(before, after);
      result.setPoint(before.point().interp(after.point(), fraction));
      if (before.point().distanceTo(after.point()) > 0.00001) {
        result.direction = before.point().diretionTo(after.point());
      }
      return result;
    };

    BusState.fromJSON = function (json) {
      var busState = Object.create(BusState.prototype);
      return Object.assign(busState, json, {
        direction: json.direction,
        speed: json.speed,
        passengers: json.passengers,
        isTimePoint: json.isTimePoint,
        isTripper: json.isTripper,
        isBusAtStop: json.isBusAtStop,
        latitude: json.latitude,
        longitude: json.longitude,
        realtimeLatitude: json.realtimeLatitude,
        realtimeLongitude: json.realtimeLongitude,
        patternPointId: json.patternPointId,
        isProjected: json.isProjected,
        isGenerated: json.isGenerated,
        version: json.version
      });
    };

    return BusState;
  }());
  models.BusState = BusState;
})(models || (models = {}));


var models;
(function (models) {
  var Pattern = /** @class */ (function () {
    function Pattern() {
      this.points = new Array();
    }

    Pattern.fromJSON = function (json) {
      var pattern = Object.create(Pattern.prototype);
      return Object.assign(pattern, json, {
        name: json.name,
        points: Pattern.loadPatternPoints(json)
      });
    };

    Pattern.loadPatternPoints = function (json) {
      var pps = new Array();
      if (json.points) {
        json.points.forEach(function (p) {
          pps.push(models.PatternPoint.fromJSON(p));
        });
      }
      return pps;
    };

    return Pattern;
  }());
  models.Pattern = Pattern;
})(models || (models = {}));


var models;
(function (models) {
  var PatternPoint = /** @class */ (function () {
    function PatternPoint() {
    }

    PatternPoint.fromJSON = function (json) {
      var pat = Object.create(PatternPoint.prototype);
      return Object.assign(pat, json, {
        id: json.id,
        name: json.name,
        latitude: json.latitude,
        longitude: json.longitude,
        isBusStop: json.isBusStop,
        isTimePoint: json.isTimePoint
      });
    };

    return PatternPoint;
  }());
  models.PatternPoint = PatternPoint;
})(models || (models = {}));


var models;
(function (models) {
  var Route = /** @class */ (function () {
    function Route() {
    }

    Route.fromJSON = function (json) {
      var route = Object.create(Route.prototype);
      return Object.assign(route, json, {
        id: json.id,
        routeColor: json.routeColor,
        routeColorAdjustment: json.routeColorAdjustment,
        routeName: json.routeName,
        routeShortName: json.routeShortName,
        routeTextColor: json.routeTextColor
      });
    };

    return Route;
  }());
  models.Route = Route;
})(models || (models = {}));


var models;
(function (models) {
  var Vector2 = /** @class */ (function () {
    function Vector2(x, y) {
      this.x = x;
      this.y = y;
    }
    Vector2.prototype.interp = function (other, fraction) {
      var dx = (other.x - this.x) * fraction;
      var dy = (other.y - this.y) * fraction;
      return new Vector2(this.x + dx, this.y + dy);
    };
    Vector2.prototype.distanceTo = function (other) {
      return this.minus(other).length();
    };
    Vector2.prototype.length = function () {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    };
    Vector2.prototype.minus = function (other) {
      return new Vector2(this.x - other.x, this.y - other.y);
    };
    Vector2.prototype.diretionTo = function (other) {
      var diff = other.minus(this);
      return this.degrees(Math.atan2(diff.x, diff.y));
    };
    Vector2.prototype.radians = function (degrees) {
      return degrees * Math.PI / 180;
    };
    ;
    Vector2.prototype.degrees = function (radians) {
      return radians * 180 / Math.PI;
    };
    ;
    Vector2.prototype.dot = function (other) {
      return this.x * other.x + this.y * other.y;
    };
    return Vector2;
  }());
  models.Vector2 = Vector2;
})(models || (models = {}));


var util;
(function (util) {
  var Ajax = /** @class */ (function () {
    function Ajax() {
    }
    Ajax.sendAjaxRequest = function (_type, _url, _params, _callback) {
      var request = jQuery.ajax({
        type: _type,
        url: _url,
        data: _params,
        contentType: 'json'
      });
      request.done(function (res) {
        _callback(res);
      });
      request.fail(function (jqXHR, textStatus) {
        console.error(jqXHR);
        _callback({ err: true, message: "Request failed: " + textStatus });
      });
    };
    return Ajax;
  }());
  util.Ajax = Ajax;
})(util || (util = {}));


//# sourceMappingURL=lib.js.map
