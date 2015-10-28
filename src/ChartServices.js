/**
 * 'chartProperties' refer to attributes of the chart model that the application interact with
 * such as whether the chart groups by Industry or Sec Type etc ...
 * 'chartOptions' refer to literally to highcharts constructor options
 */

var TURBO_THRESHOLD = 2000;

angular.module('decorated-high-charts').factory('chartDataUniverse', function () {
    return {
        data: [],
        getSelectedRowsData: function(){
            return this.data;
        },
        scatterPlotPointClickCallback: function(){},
        setupUniverse: function(pScope){
            this.data = pScope.data;
            this.getSelectedRowsData = pScope.getSelectedRowsData || this.getSelectedRowsData;
            this.scatterPlotPointClickCallback = pScope.scatterPlotPointClickCallback || this.scatterPlotPointClickCallback;
            this.key = pScope.key;
        }
    }
});

angular.module('decorated-high-charts').factory('chartFactory', function (boxPlotProvider, scatteredChartProvider, pieChartProvider, heatMapProvider, columnChartProvider) {
    var chartFactoryMap = {
        "Box Plot": boxPlotProvider,
        "Scattered Plot": scatteredChartProvider,
        "Pie Chart": pieChartProvider,
        "Column Chart": columnChartProvider
    };
    return {
        getHighchartOptions: function (chartProperties) {
            return chartFactoryMap[chartProperties.type].produceChartOption(chartProperties, chartProperties.dataToShow !== "all");
        },
        getRelevantProperties: function(chartProperties){
            if( chartProperties.type === "Pie Chart" || chartProperties.type === "Box Plot" )
                return ["group_by", "analytic"];
            else if( chartProperties.type === "Scattered Plot" )
                return ["x_attribute", "y_attribute", "radius", "group_by"];
            else if( chartProperties.type === "Column Chart" )
                return ["x_attribute", "y_attribute", "group_by"];
        },
        getRequiredProperties: function(chartProperties){
            if( chartProperties.type === "Pie Chart" || chartProperties.type === "Box Plot" )
                return ["group_by", "analytic"];
            else if( chartProperties.type === "Scattered Plot" || chartProperties.type === "Column Chart" )
                return ["x_attribute", "y_attribute"];
        },
        regressionTypes:  [
            {
                tag: 'linear',
                text: "Linear"
            },
            {
                tag: 'polynomial',
                text: "Polynomial"
            },
            {
                tag: 'logarithmic',
                text: "Logarithmic"
            },
            {
                tag: 'exponential',
                text: 'Exponential'
            }
        ]
    }
});

angular.module('decorated-high-charts').factory('pieChartProvider', function (chartDataUniverse, commonHighchartConfig) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig),
        {
            chart: {
                type: "pie",
                marginTop: 40
            },
            plotOptions: {
                pie: {
                    dataLabels: {
                        formatter: function () {
                            return this.point.name == "null" ? "N/A" : this.point.name;
                        }
                    }
                }
            },
            tooltip: {
                formatter: function () {
                    return ("<b>" + this.series.name + "</b>: " + this.point.name + "<br/>" +
                    "<b>Percent of Pie</b>: " + numeral(this.percentage).format('0,0.00') + "%<br/>" +
                    "<b>Total for Slice</b>: " + numeral(this.y / 1000).format('0,0') + "<br/>" +
                    "<b>Total for Pie</b>: " + numeral(this.total / 1000).format('0,0'));
                },
                pie: {
                    allowPointSelect: true,
                    cursor: 'pointer',
                    dataLabels: {
                        enabled: true,
                        format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                        style: {
                            color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
                        }
                    }
                }
            }
        }
    );
    return {
        produceChartOption: function (chartProperties, onlyOnSelectedRows) {
            var toGroupBy = chartProperties.group_by.colTag;
            var groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), toGroupBy);

            var categories = _.keys(groupedAnalytic);
            var pieSeries = [];
            var data = [];
            _.each(categories, function (category) {
                var value = aggregate(groupedAnalytic[category], chartProperties.analytic);
                var dataPoint = {name: category, y: value};
                data.push(dataPoint);
            });
            pieSeries.push({
                name: chartProperties.group_by.text,
                data: data
            });
            var cfg = _.clone(cfgTemplate);
            if (categories.length < 10)
                cfg.series = pieSeries;
            else
                cfg.subtitle = {text: '* Too Many Slices of Pie to Display from Grouping by ' + chartProperties.group_by.text + ' *'};
            cfg.title.text = chartProperties.group_by.text + " weighted by " + chartProperties.analytic.text;
            return cfg;
        }
    };
});

angular.module('decorated-high-charts').factory('boxPlotProvider', function (chartDataUniverse, commonHighchartConfig) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig), {
        chart: {
            type: 'boxplot',
            marginTop: 40
        },
        title: {
            text: null
        },
        tooltip: {
            valueDecimals: 2
        },
        legend: {
            enabled: false
        },
        plotOptions: {},
        xAxis: {
            labels: {
                formatter: function () {
                    return this.value == "null" ? "N/A" : this.value;
                }
            }
        },
        yAxis: {
            title: {
                text: null
            }
        },
        series: null,
        credits: {
            enabled: false
        }
    });
    return {
        produceChartOption: function (chartProperties, onlyOnSelectedRows) {
            var toGroupBy = chartProperties.group_by.colTag;
            var analytic = chartProperties.analytic.colTag;
            var groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), toGroupBy);
            var categories = _.keys(groupedAnalytic);
            var boxPlotData = [];
            _.each(categories, function (category) {
                var data = _.pluck(groupedAnalytic[category], analytic);
                boxPlotData.push(
                    [ss.min(data), ss.quantile(data, 0.25), ss.median(data), ss.quantile(data, 0.75), ss.max(data)]
                );
            });
            var boxPlotSeries = {name: chartProperties.analytic.text, data: boxPlotData};
            var cfg = _.clone(cfgTemplate);
            cfg.xAxis.categories = categories;
            cfg.xAxis.title = cfg.xAxis.title ? cfg.xAxis.title : {};
            cfg.xAxis.title.text = chartProperties.group_by.text;
            cfg.yAxis.title.text = chartProperties.analytic.text;
            if (categories.length < 15)
                cfg.series = [boxPlotSeries];
            else
                cfg.subtitle = {text: '* Too Many Boxes to Display from Grouping by ' + chartProperties.group_by.text + ' *'};

            cfg.title.text = chartProperties.analytic.text + ' by ' + chartProperties.group_by.text;
            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('scatteredChartProvider', function (chartDataUniverse, dhcStatisticalService, commonHighchartConfig, dhcSeriesColorService, $rootScope) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig), {
        chart: {
            type: 'scatter',
            zoomType: 'xy',
            marginTop: 40
        },
        legend: {
            enabled: true
        },
        series: [],
        credits: {
            enabled: false
        }
    });

    /**
     * Transforms data from disparate data structures into a Highchart Series ready for plotting
     * @param categories category represent a separate series to be plotted, this is useful to distinguish data from different issuers/tickers/sectors for example
     * @param radius the radius attribute (if applicable)
     * @param groupedData the raw data grouped by the categories provided
     * @param xAttr the x-axis attribute to extract from members of groupedData
     * @param yAttr the y-axis attribute to extract from members of groupedData
     * @param stdevForOutlierRemoval the number of stdev beyond which outliers should be excluded (could be null to not remove anything)
     * @returns {Array}
     */
    function generateSeries(categories, radius, groupedData, xAttr, yAttr, stdevForOutlierRemoval, propertiesHash) {
        var series = [];
        _.each(categories, function (category) {
            var data = [];
            // pick out x, y or Radius
            if (radius != null) {
                _.each(groupedData[category], function (item) {
                    if (item[xAttr.colTag] != null && item[yAttr.colTag])
                        data.push({
                            id: item[chartDataUniverse.key],
                            name: item[chartDataUniverse.key],
                            x: item[xAttr.colTag],
                            y: item[yAttr.colTag],
                            z: item[radius.colTag]
                        });
                });
            } else {
                _.each(groupedData[category], function (item) {
                    if (item[xAttr.colTag] != null && item[yAttr.colTag])
                        data.push({
                            id: item[chartDataUniverse.key],
                            name: item[chartDataUniverse.key],
                            x: item[xAttr.colTag],
                            y: item[yAttr.colTag]
                        });
                });
            }
            data = data.sort(function (a, b) {
                return a.x - b.x;
            });

            var result = processData(chartDataUniverse.data, stdevForOutlierRemoval, xAttr, yAttr);

            var serObj = {
                name: category == "null" ? "Not Found" : category,
                tooltip: {
                    pointFormat: '<span style="color:{series.color}">{point.name}</span><br/><b>' +
                    xAttr.text + '</b>: {point.x:,.2f} <br/><b>' + yAttr.text + '</b>: {point.y:,.2f}' +
                    '<br/>' +
                    '<br/><b>' + xAttr.text + ' &mu;</b>:' + numeral(result.xMean.toFixed(2)).format('0,0.00') +
                    '<br/><b>' + yAttr.text + ' &mu;</b>:' + numeral(result.yMean.toFixed(2)).format('0,0.00') +
                    '<br/>' +
                    '<br/><b>' + xAttr.text + ' &sigma;</b>:' + numeral(result.xStdev.toFixed(2)).format('0,0.00') +
                    '<br/><b>' + yAttr.text + ' &sigma;</b>:' + numeral(result.yStdev.toFixed(2)).format('0,0.00')
                },
                data: data,
                marker: {
                    symbol: 'circle',
                    states: {
                        select: {
                            lineColor: null
                        }
                    }
                },
                color: null
            };

            const seriesColor = dhcSeriesColorService.getOrAssign("chart" + propertiesHash, serObj.name);
            serObj.color = seriesColor;
            serObj.marker.states.select.lineColor = seriesColor;

            series.push(serObj);
        });
        return series;
    }

    /**
     * TODO merge with regressionJSWrapper
     * Fit a simple line through the given series and return some high level statistics
     * @param series used as the input of the regression
     * @param chartId the current chartId so we can retrieve the right series color
     * @returns a Highcharts Series that can be directly used for plotting
     */
    function addFittedLine(series, chartId) {
        var index = 0;
        _.each(series, function (currentSeries) {
            var regressionOutput = dhcStatisticalService.getLinearFit(currentSeries.data);
            var color = dhcSeriesColorService.get("chart" + chartId, currentSeries.name);
            series.push({
                name: currentSeries.name + " Regression (Linear)",
                marker: {
                    enabled: false
                },
                type: "line",
                showInLegend: false,
                enableMouseTracking: false,
                color: color,
                data: regressionOutput.predictedValue
            });
            index++;
        });
        return series;
    }

    /**
     * Wraps around regression JS and help return Highcharts splines  series
     * @param series series used as the input of the regression
     * @param type the primary regression type ex: linear, polynomial
     * @param extraArgs arguments for this regression (such as the degree of polynomial)
     * @param chartId the current chartId so we can retrieve the right series color
     * @returns a Highcharts Series that can be directly used for plotting
     */
    function regressionJSWrapper(series, type, extraArgs, chartId) {
        var index = 0;
        _.each(series, function (currentSeries) {
            if (currentSeries.data.length <= 1)
                return;
            var regressionOutput = dhcStatisticalService.regressionJSWrapper(currentSeries.data, type, extraArgs);
            var color = dhcSeriesColorService.get("chart" + chartId, currentSeries.name);
            series.push({
                name: currentSeries.name + " Regression (" + type + ")",
                marker: {
                    enabled: false
                },
                type: "spline",
                showInLegend: false,
                enableMouseTracking: false,
                color: color,
                data: regressionOutput.predictedValue
            })
            index++;
        });
        return series;
    }

    /**
     * Pre-Process the actual data for what is imminently about to become a Highcharts Series. Perform filtering and aggregate statistics computation
     * @param data
     * @param stdevForOutlierRemoval
     * @param xAttr
     * @param yAttr
     * @returns {{data: *, xMean: (*|number), yMean: (*|number), xStdev: (*|number), yStdev: (*|number)}}
     */
    function processData(data, stdevForOutlierRemoval, xAttr, yAttr) {
        var yData = _.chain(data).pluck(yAttr.colTag).compact().value(),
            xData =  _.chain(data).pluck(xAttr.colTag).compact().value();
        var xMean = ss.mean(xData), xStdev = ss.standard_deviation(xData),
            yMean = ss.mean(yData), yStdev = ss.standard_deviation(yData), filteredData;

        if (stdevForOutlierRemoval)
            filteredData = _.filter(data, function (datum) {
                var xCutoff = Math.abs(xMean - datum[xAttr.colTag]), yCutoff = Math.abs(yMean - datum[yAttr.colTag]);
                return xCutoff < stdevForOutlierRemoval * xStdev && yCutoff < stdevForOutlierRemoval * yStdev;
            });
        else
            filteredData = data;

        return {
            data: filteredData,
            xMean: xMean || 0.0,
            yMean: yMean || 0.0,
            xStdev: xStdev || 0.0,
            yStdev: yStdev || 0.0
        };
    }

    return {
        addRegression: function (series, type, extraArgs, id) {
            if (type)
                return regressionJSWrapper(series, type, extraArgs, id);
            else
                return addFittedLine(series, id);
        },
        removeRegression: function (series) {
            for (var i = 0; i < series.chart.series.length; i++) {
                if (series.color == series.chart.series[i].color && series.chart.series[i].name.match("Regression")) {
                    series.chart.series[i].remove();
                    break;
                }
            }
        },
        redrawRegression: function (series, chartProperties) {
            this.removeRegression(series);
            if (series.data.length > 1) {
                if (chartProperties.regression === "linear") {
                    var regressionOutput = dhcStatisticalService.getLinearFit(series.data);
                    var color = dhcSeriesColorService.get("chart" + chartProperties.$$hashKey, series.name);
                    series.chart.addSeries({
                        name: series.name + " Regression (Linear)",
                        marker: {
                            enabled: false
                        },
                        type: "line",
                        showInLegend: false,
                        enableMouseTracking: false,
                        color: color,
                        data: regressionOutput.predictedValue
                    });
                }
                else if (chartProperties.regression != null && chartProperties.regression != "") {
                    var extraArg = chartProperties.regression === "polynomial" ? chartProperties.regression_degree : null;
                    var regressionOutput = dhcStatisticalService.regressionJSWrapper(series.data, chartProperties.regression, extraArg);
                    var color = dhcSeriesColorService.get("chart" + chartProperties.$$hashKey, series.name);
                    series.chart.addSeries({
                        name: series.name + " Regression (" + chartProperties.regression + ")",
                        marker: {
                            enabled: false
                        },
                        type: "spline",
                        showInLegend: false,
                        enableMouseTracking: false,
                        color: color,
                        data: regressionOutput.predictedValue
                    });
                }
            }
        },
        produceChartOption: function (chartProperties, onlyOnSelectedRows) {
            dhcSeriesColorService.removePalate("chart" + chartProperties.$$hashKey);
            var xAttr = chartProperties.x_attribute,
                yAttr = chartProperties.y_attribute,
                radius = chartProperties.radius,
                groupByAttr = chartProperties.group_by,
                series = [], cfg = _.clone(cfgTemplate), groupedData = {};
            if ((getValidDataScope(onlyOnSelectedRows, chartDataUniverse)).length <= TURBO_THRESHOLD) {  // && not a special chart
                var result = processData(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), chartProperties.outlier_remove, xAttr, yAttr);
                var data = result.data;

                if (groupByAttr != null)
                    groupedData = _.groupBy(data, groupByAttr.colTag);
                else
                    groupedData[chartProperties.x_attribute.text] = data;

                var categories = _.keys(groupedData);

                series = generateSeries(categories, radius, groupedData, xAttr, yAttr, chartProperties.outlier_remove, chartProperties.$$hashKey);
                // get correct regression color
                if (chartProperties.regression === "linear")
                    addFittedLine(series, chartProperties.$$hashKey);
                else if (chartProperties.regression != null && chartProperties.regression != "") {
                    var extraArg = chartProperties.regression === "polynomial" ? chartProperties.regression_degree : null;
                    regressionJSWrapper(series, chartProperties.regression, extraArg, chartProperties.$$hashKey);
                }
            } else
                cfg.subtitle = {text: '* Too Many Data Points to Plot - (Future Versions will Implement Random Sampling and Drilldown Features) *'};

            if (radius != null)
                cfg.chart.type = "bubble";
            else
                cfg.chart.type = "scatter";

            if (series.length > 10) {
                cfg.subtitle = {text: '* Too Many Series to Plot *'};
            }
            else
                cfg.series = series;

            // Only have legend if there is more than non-regression series
            cfg.legend.enabled = _.reject(series, function(ser){
                return ser.type === "spline";
            }).length > 1;

            cfg.xAxis.title.text = xAttr.text;
            cfg.yAxis.title.text = yAttr.text;
            cfg.title.text = xAttr.text + " vs. " + yAttr.text;

            cfg.plotOptions = {
                series: {
                    point: {
                        events: {
                            click: function(e){
                                e.stopPropagation();
                                if( chartDataUniverse.scatterPlotPointClickCallback({point: this}) ){
                                    $rootScope.chartScope.apiHandle.api.togglePoint(this.id);
                                }
                            }
                        }
                    }
                }
            };

            cfg.tooltip.hideDelay = 0;

            if (chartProperties.show_datalabel) {
                cfg.plotOptions[cfg.chart.type] = {
                    dataLabels: {
                        allowOverlap: false,
                        enabled: true,
                        formatter: function () {
                            return this.point.name
                        }
                    }
                }
            }
            else
                delete cfg.plotOptions[cfg.chart.type];

            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('heatMapProvider', function (chartDataUniverse, commonHighchartConfig) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig), {
        chart: {type: 'heatmap', marginTop: 40, marginBottom: 40},
        colorAxis: {min: 0, minColor: Highcharts.getOptions().colors[3], maxColor: Highcharts.getOptions().colors[0]},
        yAxis: {title: {text: null}, showEmpty: false},
        xAxis: {title: {text: null}, showEmpty: false},
        legend: {
            align: 'right',
            layout: 'vertical',
            margin: 0,
            verticalAlign: 'top',
            y: 25,
            symbolHeight: 320
        },

        tooltip: {
            formatter: function () {
                return '<b>' + this.series.xAxis.categories[this.point.x] + '</b> sold <br><b>' +
                    this.point.value + '</b> items on <br><b>' + this.series.yAxis.categories[this.point.y] + '</b>';
            }
        }
    });
    return {
        produceChartOption: function (chartProperties, onlyOnSelectedRows) {
            var xAttr = chartProperties.x_attribute;
            var yAttr = chartProperties.y_attribute;
            var xCategories = _.uniq(_.pluck(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), xAttr.colTag));
            var yCategories = _.uniq(_.pluck(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), yAttr.colTag));

            var data = [];

            function aggregate(groupData, chartProperties) {
                // TODO be able to avg, count
                var dataArray = _.pluck(groupData, chartProperties.analytic.colTag);
                var sum = 0;
                for (var i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                return sum;
            }

            for (var i = 0; i < xCategories.length; i++) {
                for (var j = 0; j < yCategories.length; j++) {
                    var groupData = _.filter(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), function (data) {
                        return data[xAttr.colTag] == xCategories[i] && data[yAttr.colTag] == yCategories[j];
                    });
                    var aggregatedData = aggregate(groupData, chartProperties);
                    data.push([i, j, aggregatedData]);
                }
            }
            var series = {
                name: "Test",
                data: data,
                borderWidth: 1,
                dataLabels: {
                    enabled: true,
                    color: 'black',
                    style: {
                        textShadow: 'none',
                        HcTextStroke: null
                    }
                }
            };
            var cfg = _.clone(cfgTemplate);
            cfg.series = [series];
            cfg.xAxis.categories = xCategories;
            cfg.yAxis.categories = yCategories;
            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('commonHighchartConfig', function ($rootScope) {
    $.extend(Highcharts.Renderer.prototype.symbols, {
        X: function (a, b, c, d) {
            return ["M", a, b, "L", a + c, b + d, "M", a + c, b, "L", a, b + d]
        }
    });
    var commonCfg = {
        chart: {
            animation: false,
            marginTop: -12,
            events: {
                load: function () {
                    for (var i = 0; i < this.exportSVGElements.length; i++) {
                        this.exportSVGElements[i].toFront();
                    }
                }
            }
        },
        title: {
            text: "",
            events: {
                click: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    dhc.onTitleClick(e, $rootScope.chartScope, this);
                }
            }
        },
        plotOptions: {
            series: {turboThreshold: TURBO_THRESHOLD}
        },
        exporting: {
            enabled: false
        },
        tooltip: {
            valueDecimals: 2,
            useHTML: true,
            delayForDisplay: 1000
        },
        credits: {
            enabled: false
        },
        xAxis: {
            title: {
                events: {
                    click: function (event) {
                        dhc.onAxisClick.call(this, event, $rootScope.chartScope);
                    }
                }
            }
        },
        yAxis: {
            title: {
                events: {
                    click: function (event) {
                        dhc.onAxisClick.call(this, event, $rootScope.chartScope);
                    }
                }
            }
        }
    };
    return _.clone(commonCfg);
});



angular.module('decorated-high-charts').factory('columnChartProvider', function (chartDataUniverse, commonHighchartConfig) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig), {
        chart: {type: 'column'},
        xAxis: {title: {text: null}, showEmpty: false},
        yAxis: {title: {text: null}, showEmpty: false},
        plotOptions: {
            column: {
                pointPadding: 0.2,
                borderWidth: 0
            }
        }
    });

    return {
        produceChartOption: function (chartProperties, onlyOnSelectedRows) {
            // TODO correct rough around the edges - i.e. aggregation logic for average and count, labels etc
            var x = chartProperties.x_attribute,
                y = chartProperties.y_attribute, groupedAnalytic = {};

            if (chartProperties.group_by)
                groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), chartProperties.group_by.colTag);
            else
                groupedAnalytic[x.text] = getValidDataScope(onlyOnSelectedRows, chartDataUniverse);

            var categories = _.keys(groupedAnalytic);
            var xValues = _.uniq(_.pluck(getValidDataScope(onlyOnSelectedRows, chartDataUniverse), x.colTag));
            var series = [];

            _.each(categories, function (category) {
                var categoryData = groupedAnalytic[category];
                var data = _.map(xValues, function (xValue) {
                    var toAggregate = _.filter(categoryData, function (item) {
                        return item[x.colTag] == xValue;
                    });
                    return aggregate(toAggregate, y);
                });
                category = category == "null" ? "N/A " + chartProperties.group_by.text : category;
                series.push({
                    name: category,
                    data: data
                });
            });
            var cfg = _.clone(cfgTemplate);

            if (categories.length * series.length < 50)
                cfg.series = series;
            else
                cfg.subtitle = {text: '* Too Many Bars to Display *'};

            xValues = _.map(xValues, function (item) {
                return item == null ? "N/A " + chartProperties.x_attribute.text : item;
            });
            cfg.xAxis.categories = xValues;
            cfg.xAxis.title = cfg.xAxis.title ? cfg.xAxis.title : {};
            cfg.xAxis.title.text = chartProperties.x_attribute.text;
            cfg.yAxis.title.text = y.unit;
            cfg.title.text = y.text + " by " + x.text;
            // Only have legend if there is more than non-regression series
            //cfg.legend.enabled = _.reject(series, function(ser){
            //        return ser.type === "spline";
            //    }).length > 1;
            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('dhcSeriesColorService', function () {
    const colors = [
        "#0079C1", "#009A3D", "#6C207E", "#E31B23", "#F8971D",
        "#FFD200", "#59BD81", "#59A7D7", "#9F6FAA", "#ED6B70",
        "#FABB6B", "#FFE159", "#325CBA", "#3CB54B",
        "#092A59", "#BB4B31", "#32A0BA", "#B98F2F",
        "#849DD0", "#8DCC92", "#6C809C", "#85C6D5",
        "#D69383", "#D5BC81", "#C9D4ED", "#ADBEE2", "#B3DBB6",
        "#787878", "#9DAABD", "#ADD9E3", "#E4B7AD", "#E3D3AC",
        "#A1B5DD", "#D8ECDA", "#555555", "#CEBDDE",
        "#D6ECF1", "#F1DBD5", "#5474B9"
    ];
    return {
        palate: colors,
        altPalate: angular.copy(colors).reverse(),
        fullPalate: {},
        get: function (palateName, key) {
            return this.fullPalate[palateName] && this.fullPalate[palateName][key] ? this.fullPalate[palateName][key] : null;
        },
        put: function (palateName, key, color) {
            if (!this.fullPalate[palateName])
                this.fullPalate[palateName] = {};

            this.fullPalate[palateName][key] = color;
        },
        remove: function (palateName, key) {
            if (this.fullPalate[palateName] && this.fullPalate[palateName][key])
                delete this.fullPalate[palateName][key];
        },
        removePalate: function (palateName) {
            if (this.fullPalate[palateName])
                delete this.fullPalate[palateName];
        },
        assign: function (palateName, key, useAltPalate) {
            if (!this.fullPalate[palateName])
                this.fullPalate[palateName] = {};

            const palateToUse = useAltPalate ? this.altPalate : this.palate;

            var indexToUse = Object.keys(this.fullPalate[palateName]).length;
            this.put(palateName, key, palateToUse[indexToUse % palateToUse.length]);
            return palateToUse[indexToUse];
        },
        getOrAssign: function (palateName, key, useAltPalate) {
            var color = this.get(palateName, key);
            return color ? color : this.assign(palateName, key, useAltPalate);
        },
        resetPalate: function () {
            this.fullPalate = {};
        }
    }
});


angular.module('decorated-high-charts').factory('dhcStatisticalService', function () {
    return {
        /**
         * @param data
         *          must be of 2-dimensional paired form - i.e. [[a,b],[c,d] ... ]
         */
        getLinearFit: function (data) {
            var dataArray = _.map(data, function (point) {
                return [point.x, point.y];
            });
            if (dataArray.length != 0) {
                // get regression line
                var regression = ss.linear_regression().data(dataArray);
                var cols = _.zip.apply(_, dataArray);
                var correlation = ss.sample_correlation(cols[0], cols[1]);
                var linearFn = regression.line();
                // apply predicted line to x data
                var predictedValue = _.map(dataArray, function (pt) {
                    return [pt[0], linearFn(pt[0])];
                });
                return {
                    predictedValue: predictedValue,
                    beta: regression.m(),
                    intercept: regression.b(),
                    correlation: correlation
                }
            } else {
                return {
                    predictedValue: [],
                    beta: 0,
                    intercept: 0,
                    correlation: 0
                }
            }
        },
        regressionJSWrapper: function (data, type, extraArg) {
            var dataArray = _.map(data, function (datum) {
                return [datum.x, datum.y]
            });
            if (dataArray.length != 0) {
                const scrubbedData = _.filter(dataArray, function (row) {
                    return row[0] && row[0];
                });
                var regressionOutput = regression(type, scrubbedData, extraArg);
                var predictedValue = regressionOutput.points;
                predictedValue.sort(function (a, b) {
                    return a[0] - b[0];
                });
                return {
                    predictedValue: predictedValue,
                    equation: regressionOutput.string
                }
            } else {
                return {
                    predictedValue: [],
                    equation: ''
                }
            }
        }
    }
});

function getValidDataScope(onlyOnSelectedRows, chartDataUniverse){
    return onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data;
}

function aggregate(dataToAgg, y) {
    var aggFnMap = {
        "SUM": ss.sum,
        "AVERAGE": ss.average,
        "COUNT": function (x) {
            return _.uniq(x).length;
        },
        "COUNT_AND_DISTINCT": function (x) {
            return _.uniq(x).length;
        }
    };
    var dataArray = _.pluck(dataToAgg, y.colTag);
    var aggFn = aggFnMap[y.aggregationMethod];
    return aggFn(dataArray);
}
