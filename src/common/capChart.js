function CapChart(options) {
  var self     = this,
    apiHandler = new ApiHandler(options.url);
    
  var div       = d3.select(options.id).attr("class", "capChart");
  var controls  = div.append("div").attr("class","controls");
  var dropdowns = controls.append("div").attr("class","dropdownBox");
  var chart     = div.append("div").attr("class","chart");
   
  if (!options.margin) options.margin = {top: 5, right: 60, bottom: 20, left: 60};
  if (!options.width)  options.width  = parseInt(div.style('width'), 10) - options.margin.left - options.margin.right;
  if (!options.height) options.height = options.width/2>350 ? options.width/2 :350;
  
  self.currency = options.currency || "BTC";
  self.format   = options.format   || "stacked";
  self.dataType = options.dataType || "Capitalization";
  self.range    = options.range    || "max";

//add data type dropdown
  dropdowns.append("div").attr("class","dropdowns dataType").append("select").selectAll("option")
    .data(['Capitalization', 'Trade Volume'])
    .enter().append("option")
    .html(function(d){return d})
    .attr("selected", function(d) {if (d == self.dataType) return true});
    
  dropdowns.select(".dataType select").on('change',function(){
    self.dataType = this.value;
    var d = controls.select(".interval .selected").datum();
    loadData(d);
  });
 
 
//add currency dropdown    
  var currencyList = ['BTC','USD','CNY','EUR','GBP','JPY','ILS','LTC'];
  var currencyDropdown = ripple.currencyDropdown(currencyList).selected({currency:self.currency})
    .on("change", function(currency) {
      self.currency = currency;
      var range = controls.select(".interval .selected").datum();
      loadData(range);
  });  
  
  dropdowns.append("div").attr("class","dropdowns").call(currencyDropdown);


//add chart type select  
  var type = controls.append("div").attr("class", "chartType selectList").selectAll("a")
    .data(["line","stacked"])
    .enter().append("a")
    .attr("href", "#")
    .classed("selected", function(d) { return d === self.format})
    .text(function(d) { return d })
    .on("click", function(d){
      d3.event.preventDefault();
      var that = this;
      type.classed("selected", function() { return this === that; });
      self.format = d;
      drawData();
    });

  
//add interval select  
  var interval = controls.append("div").attr("class","interval selectList").selectAll("a")
    .data([
      {name: "week",   interval:"hour",  offset: function(d) { return d3.time.day.offset(d, -7); }},
      {name: "month",  interval:"day",  offset: function(d) { return d3.time.month.offset(d, -1); }},
      {name: "quarter",interval:"day",   offset: function(d) { return d3.time.month.offset(d, -3); }},
      {name: "year",   interval:"day",   offset: function(d) { return d3.time.year.offset(d, -1); }},
      {name: "max",    interval:"month", offset: function(d) { return d3.time.year.offset(d, -3); }}
    ])
    .enter().append("a")
    .attr("href", "#")
    .classed("selected", function(d) { return d.name === self.range})
    .text(function(d) { return d.name; })
    .on("click", function(range){
      d3.event.preventDefault();
      var that = this;
      interval.classed("selected", function() { return this === that; });
      if (range.name == "custom") {
        //$('#range').slideToggle();    
      } else {
        loadData(range);
      }
    });
  
  var xScale = d3.time.scale(),
      yScale = d3.scale.linear(),
      color  = d3.scale.category20(),
      xAxis  = d3.svg.axis().scale(xScale).orient("bottom"),
      yAxis  = d3.svg.axis().scale(yScale).orient("right").tickFormat(d3.format("s"));
      
  var area = d3.svg.area()
    .x(function(d) { return xScale(d.date); })
    .y0(function(d) { return yScale(d.y0); })
    .y1(function(d) { return yScale(d.y0 + d.y); });
    
  var stack = d3.layout.stack().values(function(d) { return d.values; });  
  
  var svg, g, timeAxis, amountAxis, borders, sections, lines,
    tracer, tooltip, loader, isLoading;
  
  var capDataCache   = {};
  var tradeDataCache = {};

  if (options.resize && typeof addResizeListener === 'function') {
    addResizeListener(window, resizeChart);
  }
  
  this.suspend = function () {
    if (options.resize && typeof removeResizeListener === 'function')
      removeResizeListener(window, resizeChart);   
  }
     
  function resizeChart () {
    old = options.width;
    w = parseInt(div.style('width'), 10);
    options.width  = w-options.margin.left - options.margin.right;
    options.height = options.width/2>350 ? options.width/2 : 350;
    
    if (old != options.width) {
      drawChart(); 
      drawData();  
    } 
  }
    
  function loadData (range) {
    
    if (typeof mixpanel !== undefined) mixpanel.track("Value Chart", {
      "Data Type"  : self.dataType,
      "Currency"   : self.currency,
      "Format"     : self.format,
      "Range"      : range.name
    });
    
    self.range = range.name;
    isLoading  = true;
    loader.transition().style("opacity",1);
    tracer.transition().duration(50).style("opacity",0); 
    tooltip.transition().duration(50).style("opacity",0);     
    if (self.dataType=="Capitalization") {
      loadCapitalizationData(range, self.currency);
    } else {
      loadTradeData(range);
    }
  } 
  
  
  function loadTradeData(range) {
    if (tradeDataCache[self.currency] &&
        tradeDataCache[self.currency][self.range]) {
          
      isLoading = false;
      drawData();
      return;  
    } 

    var issuers = currencyDropdown.getIssuers(self.currency);    
    for (var i=0; i<issuers.length; i++) {
      loadTradeHelper(range, {currency:self.currency, issuer:issuers[i]}, issuers.length);
    }    
  }
  
  function loadTradeHelper (range, base, count) {
    var end = moment.utc();
    
    apiHandler.offersExercised({
      startTime     : range.offset(end),
      endTime       : end,
      timeIncrement : range.interval,
      descending    : false,
      base          : base,
      trade         : {currency:"XRP"}
      
    }, function(data){  
      if (!tradeDataCache[base.currency]) 
        tradeDataCache[base.currency] = {};
      if (!tradeDataCache[base.currency][range.name])
        tradeDataCache[base.currency][range.name] = {raw:[]};
      
        
      tradeDataCache[base.currency][range.name]['raw'].push({
        address : base.issuer,
        name    : currencyDropdown.getName(base.issuer),
        results : data.map(function(d){return[d.time.unix()*1000,d.volume]})});
      

      prepareStackedData(base.currency, range); 
      if ((self.dataType=="Trade Volume" || self.dataType=="# of Trades") &&
        self.currency==base.currency &&
        self.range==range.name) {
      
        if (tradeDataCache[base.currency][range.name]['raw'].length == count) isLoading = false;
        drawData(); //may have been changed after loading started
      
      }
    }, function (error){
      console.log(error);
      //setStatus(error.text ? error.text : "Unable to load data");
    });       
  }
  
  
  function loadCapitalizationData(range, currency) { 
    
    if (capDataCache[currency] &&
        capDataCache[currency][range.name]) {
          
      isLoading = false;
      drawData();
      return;  
    } 
    
    var end     = moment.utc();
    var issuers = currencyDropdown.getIssuers(currency);    
    var pairs = issuers.map(function(d){
      return {
        currency : currency,
        issuer   : d
      }
    });
    
    var currencies = [currency];
    var gateways   = issuers.map(function(d){
      return d;
    });
    
    console.log(currencies);
    console.log(gateways);
    
    //console.log(pairs);
    
    apiHandler.issuerCapitalization({
      currencies : currencies,
      gateways   : gateways,
      timeIncrement : range.interval,
      //pairs     : pairs,
      startTime  : range.offset(end),
      endTime    : end
      
    }, function(data){
      if (!capDataCache[self.currency]) capDataCache[self.currency] = {};
      capDataCache[self.currency][self.range] = {raw : data};
      
      prepareStackedData(currency, range);
      prepareLineData();
      
      if (self.dataType=="Capitalization" &&
        self.currency==currency &&
        self.range==range.name) {
        
        isLoading = false;
        drawData(); //may have been changed after loading started
      }
      
    }, function (error){
      console.log(error);
      //setStatus(error.text ? error.text : "Unable to load data");
    });    
  }
  
  function sortTime(a,b){return a[0]-b[0]}
  
  function prepareLineData() {
    var raw = capDataCache[self.currency][self.range].raw;
    var totals = {}, series;
    if (raw.length<2) return;
    
    for (var i=0; i<raw.length; i++) {
      series = raw[i];
      series.results.sort(sortTime);//necessary?
      for (var j=0; j<series.results.length; j++) {
        var timestamp = series.results[j][0];
        totals[timestamp]  = (totals[timestamp] || 0) + series.results[j][1];
      }
    }
  
    var t = [];
    for (var key in totals) {
      t.push([parseInt(key,10),totals[key]]);
    }
    
    
    capDataCache[self.currency][self.range].totals ={
      name    : "Total",
      address : "",
      results : t
    };  
  }
  

  
  function prepareStackedData(currency, range) {

    var timestamps = [];
    var stacked = [];
    var raw;
    
    if (self.dataType=='Capitalization') {
      raw = capDataCache[currency][range.name].raw;
      
    } else {
      raw = tradeDataCache[currency][range.name].raw;
    }

//  get all timestamps and set up data for the stacked chart    
    for (var i=0; i<raw.length; i++) {
      series = raw[i];

      stacked[i] = {
        name    : series.name,
        address : series.address,
        data    : {}
      };
      
      for (var j=0; j<series.results.length; j++) {
        var timestamp = series.results[j][0];
        stacked[i].data[timestamp] = series.results[j][1];
        timestamps.push(series.results[j][0]);
      }
    }

    timestamps.sort(function(a,b){return a-b});
//  add 0's for empty timestamps    
    for (k=0; k<stacked.length; k++) {
      var data = stacked[k].data;
      var amount;
      
      stacked[k].values = [];
      for (var m=0; m<timestamps.length; m++) {
        stacked[k].values.push({
          date : moment(parseInt(timestamps[m], 10)),
          y    : data[timestamps[m]] || 0
        });
      } 
    }  
    
    if (self.dataType=='Capitalization') {
      capDataCache[currency][range.name].stacked = stacked; 
      
    } else {
      tradeDataCache[currency][range.name].stacked = stacked; 
    }
  }
  
  function drawChart() {
    chart.html("");
    svg = chart.append("svg").attr({
        width  : options.width + options.margin.left + options.margin.right, 
        height : options.height + options.margin.top + options.margin.bottom})
      //.on("mousemove", movingInSky);
    g = svg.append("g").attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
    
    g.append("rect").attr("class", "background")
      .attr("width", options.width)
      .attr("height", options.height)
      .on("mousemove", movingInSky);
         
    timeAxis   = g.append("g").attr({class: "x axis", transform: "translate(0,"+ options.height+")"});
    amountAxis = g.append("g").attr({class: "y axis", transform: "translate("+options.width+",0)"});
    
    xScale.range([0, options.width])
    yScale.range([options.height, 0]);
    
    tracer = svg.append("g").attr("class", "tracer");
    tracer.append("line").attr("class","vertical");
    tracer.append("line").attr("class","horizontal");
    tracer.append("circle").attr("class","top").attr("r", 4);
    tracer.append("circle").attr("class","bottom").attr("r",4);
          
    tooltip = chart.append("div").attr("class", "tooltip");
    loader  = chart.append("img")
      .attr("class", "loader")
      .attr("src", "assets/images/throbber5.gif");
      
    if (isLoading) loader.style("opacity", 1);   
  }
  
  function drawData() {
  
    if (!isLoading) loader.transition().style("opacity",0);
    if      (self.dataType=='Capitalization') drawCapData(); 
    else if (self.dataType=='Trade Volume')   drawCapData();  
  }
  
  
  function drawCapData() {
    if (self.format=="stacked") {
      svg.selectAll('.line').remove();
      var data;

      if (self.dataType=='Capitalization') 
        data = capDataCache[self.currency][self.range].stacked;
        
      else if (self.dataType=='Trade Volume')   
       data = tradeDataCache[self.currency][self.range].stacked;
          
      sections = stack(data);
      
      color.domain(data.map(function(d){return d.address}));  
      xScale.domain(d3.extent(data[0].values, function(d){return d.date}));
      yScale.domain([0, d3.sum(data, function(d){
        return d3.max(d.values, function(v){return v.y});
      })]);
    
      var section = g.selectAll("g.section").data(sections);
      section.enter().append("g").attr("class","section");
      section.exit().remove();
  
      var path = section.selectAll("path").data(function(d){return[d]});
      path.enter().append("path")
        .on("mousemove", movingInGround)
        .style("fill", function(d) { return color(d.address); });
      path.transition().attr({class: "area", d: function(d) { return area(d.values); } });

      path.exit().remove();
      
    } else {
      svg.selectAll('.section').remove();
      if (self.dataType=='Capitalization') {
        lines = capDataCache[self.currency][self.range].raw;
        
      } else if (self.dataType=='Trade Volume')   {
        lines = tradeDataCache[self.currency][self.range].raw;
      }
       
      
      color.domain(lines.map(function(d){return d.address})); 
      
      xScale.domain(getExtents("x", lines));
      yScale.domain(getExtents("y", lines));

      var line = g.selectAll("g.line").data(lines);
      line.enter().append("g").attr("class","line");
      line.exit().remove();
      
      var p = line.selectAll("path").data(function(d){return[d]});
      p.enter().append("path")
        .on("mouseover", movingOnLine)
        .style("stroke", function(d) { return color(d.address); });
        
      p.transition().attr("d", function(d) {
         var l = d3.svg.line()
          .x(function(d) { return xScale(d[0]); })
          .y(function(d) { return yScale(d[1]); }); 
          return l(d.results);
      });
        
      p.exit().remove();
    }
    
    var ticks = options.width/60-(options.width/60)%2;

    timeAxis.call(xAxis.ticks(ticks).scale(xScale));
    amountAxis.call(yAxis.scale(yScale));
  } 
  
  
  function movingInSky() {
    var top, date, i, j, cx, cy, position;
    if (!isLoading && self.format=="stacked") {

      top  = sections[sections.length-1].values;
      date = xScale.invert(d3.mouse(this)[0]);
      i    = d3.bisect(top.map(function(d){return d.date}), date);
   
      if (date<(top[i].date+top[i-1].date)/2) i--;
      cy = yScale(top[i].y+top[i].y0)+options.margin.top;
      cx = xScale(top[i].date)+options.margin.left;

//    determine position of tooltip      
      position = getTooltipPosition(cx, cy);
      date     = top[i].date.utc().format("MMMM D YYYY");
      amt      = commas(top[i].y+top[i].y0, 2);  
      
      handleTooltip("Total", null, date, amt, position);
      handleTracer(cx, cy);
        
    } else if (!isLoading) {
      top  = lines[lines.length-1].results;
      date = xScale.invert(d3.mouse(this)[0]);
      amt  = yScale.invert(d3.mouse(this)[1]);
      //i    = d3.bisect(top.map(function(d){return d[0]}), date);  

      rows = lines.map(function(d,i){ 
        j = d3.bisectLeft(d.results.map(function(d){return d[0]}), date);
        return [i,j,d.results[j]?d.results[j][1]:0]});
      
      rows.sort(function(a,b){return a[2]-b[2]});
      for (i=0;i<rows.length;i++) {if (rows[i][2]>amt) break;}
      if (i==rows.length) i--;
      
      line = lines[rows[i][0]];
      j    = rows[i][1];

      
      cy = yScale(line.results[j][1])+options.margin.top;
      cx = xScale(line.results[j][0])+options.margin.left;

//    determine position of tooltip      
      position = getTooltipPosition(cx, cy);
      date     = moment(line.results[j][0]).utc().format("MMMM D YYYY");
      amt      = commas(line.results[j][1], 2);  
      var name = currencyDropdown.getName(line.address) || line.name;
      
      handleTooltip(name, line.address, date, amt, position);
      handleTracer(cx, cy);
    }
  }


  function movingInGround(section) {
    if (!isLoading) {
      var tx, ty;
      var date = xScale.invert(d3.mouse(this)[0]);
      var i    = d3.bisect(section.values.map(function(d){return d.date}), date);
   
      if (date<(section.values[i].date+section.values[i-1].date)/2) i--;
      var cy  = yScale(section.values[i].y+section.values[i].y0)+options.margin.top;
      var cx  = xScale(section.values[i].date)+options.margin.left;
      var c2y = yScale(section.values[i].y0)+options.margin.top;
   
      
      
//    determine position of tooltip      
      var position = getTooltipPosition(cx, cy);
      var name     = currencyDropdown.getName(section.address);
      var amount   = commas(section.values[i].y, 2);
      date = section.values[i].date.utc().format("MMMM D YYYY");
          
      handleTooltip(name, section.address, date, amount, position);
      handleTracer(cx, cy, c2y);
    }
  }
  
  function movingOnLine(line) {
    if (!isLoading) {
      var tx, ty;
      var date = xScale.invert(d3.mouse(this)[0]);
      var i    = d3.bisect(line.results.map(function(d){return d[0]}), date);
   
      if (i && date<(line.results[i][0]+line.results[i-1][0])/2) i--;
      var cy  = yScale(line.results[i][1])+options.margin.top;
      var cx  = xScale(line.results[i][0])+options.margin.left;
   
      
      
//    determine position of tooltip      
      var position = getTooltipPosition(cx, cy);
      var name     = currencyDropdown.getName(line.address);
      var amount   = commas(line.results[i][1], 2);
      date = moment(line.results[i][0]).utc().format("MMMM D YYYY");
          
      handleTooltip(name, line.address, date, amount, position);
      handleTracer(cx, cy);
    }    
  }


  function handleTracer (cx, cy, c2y) {
    
    tracer.select(".top").transition().duration(50).attr({cx: cx, cy: cy});
    
    if (c2y) {
      tracer.select(".vertical").transition().duration(50).attr({x1:cx, x2:cx, y1:cy, y2:c2y});
      tracer.select(".horizontal").transition().duration(50).style("opacity",0);
      tracer.select(".bottom").transition().duration(50).attr({cx: cx, cy: c2y}).style("opacity",1);
    } else {
      tracer.select(".vertical").transition().duration(50).attr({x1:cx, x2:cx, y1:options.margin.top, y2:options.height+options.margin.top});
      tracer.select(".horizontal").transition().duration(50).attr({x1:cx, x2:options.width+options.margin.left, y1:cy, y2:cy}).style("opacity",1);
      tracer.select(".bottom").transition().duration(50).style("opacity",0);      
    }  
    
    tracer.select(".top").transition().duration(50).attr({cx: cx, cy: cy});
    tracer.transition().duration(50).style("opacity",1);  
  }
  
  
  function handleTooltip(title, address, date, amount, position) {
    
    tooltip.html("");
    tooltip.append("h5").html(title).style("color", address ? color(address) : "inherit");
    if (address) tooltip.append("div").html(address)
        .style("color", color(address))
        .attr("class", "address"); 
    tooltip.append("div").html(date).attr("class", "date"); 
    tooltip.append("div").html(amount).attr("class", "amount"); 
    tooltip.transition().duration(100).style("left", position[0] + "px")     
      .style("top", position[1] + "px") 
      .style("opacity",1);    
  }
  
  
  function getTooltipPosition(cx,cy) {
    var tx, ty;
    if (cx+120>options.width+options.margin.right) tx = cx-260;
    else if (cx-120<options.margin.left) tx = cx+20;
    else tx = cx-120;
    
    if (cy-80<options.margin.top) ty = cy+80;
    else ty = cy-80;
    return [tx,ty];
  }
  
  
  function commas (number, precision) {
    var parts = number.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (precision && parts[1]) parts[1] = parts[1].substring(0,precision);
    return parts.join(".");
  }
  
  function getExtents(axis, data) {
    
    var max, min, rows = data.map(function(d){
        return d3.extent(d.results, function(d){ return axis=="x" ? d[0]:d[1]; });
    });
    
    min = d3.min(rows, function(d){return d[0]});
    max = d3.max(rows, function(d){return d[1]});
    if (axis=="y") max *= 1.1; 
    return [min, max];
  }

  drawChart();
  var range = controls.select(".interval .selected").datum();
  loadData(range);  
}