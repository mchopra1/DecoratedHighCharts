/**
 * 'chartProperties' refer to attributes of the chart model that the application interact with
 * such as whether the chart groups by Industry or Sec Type etc ...
 * 'chartOptions' refer to literally to highcharts constructor options
 */

var TURBO_THRESHOLD = 2000;

angular.module('decorated-high-charts').factory('chartDataUniverse', function () {
    return {
        data: [],
        getSelectedRowsData: function(){},
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
        getHighchartOptions: function (chartProperties, onlyOnSelectedRows) {
            return chartFactoryMap[chartProperties.type].produceChartOption(chartProperties, onlyOnSelectedRows);
        },
        getRelevantProperties: function(chartProperties){
            if( chartProperties.type === "Pie Chart" || chartProperties.type === "Box Plot" )
                return ["group_by", "analytic"];
            else if( chartProperties.type === "Scattered Plot" )
                return ["x_attribute", "y_attribute", "radius", "group_by"];
            else if( chartProperties.type === "Column Chart" )
                return ["x_attribute", "y_attribute", "group_by"];
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
            var groupedAnalytic = _.groupBy(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, toGroupBy);

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
            var groupedAnalytic = _.groupBy(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, toGroupBy);
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

angular.module('decorated-high-charts').factory('scatteredChartProvider', function (chartDataUniverse, dhcStatisticalService, commonHighchartConfig, dhcSeriesColorService) {
    var cfgTemplate = _.extend(_.clone(commonHighchartConfig), {
        chart: {
            type: 'scatter',
            zoomType: 'xy',
            marginTop: 40
        },
        legend: {
            enabled: true
        },
        title: {
            text: null
        },
        xAxis: {
            title: {
                text: null,
                margin: 0
            }
        },
        yAxis: {
            title: {
                text: null,
                margin: 5
            }
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
                series = [], cfg = _.clone(cfgTemplate), data, groupedData = {};
            if ((onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data).length <= TURBO_THRESHOLD) {  // && not a special chart
                var result = processData(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, chartProperties.outlier_remove, xAttr, yAttr);
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
                            click: function(){
                                if( chartDataUniverse.scatterPlotPointClickCallback )
                                    chartDataUniverse.scatterPlotPointClickCallback();
                            }
                            //    function () {
                            //    this.select(true, true);
                            //    chartDataUniverse.activeTabOverride = true;
                            //    if (chartDataUniverse.selectedRows[this.id])
                            //        chartDataUniverse.removeSelectedRow(this.id);
                            //    else
                            //        chartDataUniverse.addSelectedRow(this.id);
                            //
                            //    chartDataUniverse.activeTabOverride = false;
                            //}
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
            var xCategories = _.uniq(_.pluck(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, xAttr.colTag));
            var yCategories = _.uniq(_.pluck(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, yAttr.colTag));

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
                    var groupData = _.filter(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, function (data) {
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
            text: ""
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
            tickInterval: 1,
            minPadding: 0,
            maxPadding: 0
        },
        yAxis: {
            tickInterval: 1,
            minPadding: 0,
            maxPadding: 0
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
                groupedAnalytic = _.groupBy(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, chartProperties.group_by.colTag);
            else
                groupedAnalytic[x.text] = onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data;

            var categories = _.keys(groupedAnalytic);
            var xValues = _.uniq(_.pluck(onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data, x.colTag));
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
            cfg.yAxis.title.text = y.unit;
            cfg.title.text = y.text + " by " + x.text;
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



function aggregate(dataToAgg, y) {
    var aggFnMap = {
        "SUM": ss.sum,
        "AVERAGE": ss.average,
        "COUNT": function (x) {
            return _.uniq(x).length;
        }
    };
    var dataArray = _.pluck(dataToAgg, y.colTag);
    var aggFn = aggFnMap[y.aggregationMethod];
    return aggFn(dataArray);
}

(function () {

    if (typeof String.prototype.endsWith !== 'function') {
        String.prototype.endsWith = function (suffix) {
            return this.indexOf(suffix, this.length - suffix.length) !== -1;
        };
    }

    Date.prototype.getYYYYMMDD = function () {
        var month = this.getMonth() + 1;
        month = month.toString().length == 1 ? "0" + month : month;
        var day = this.getDate();
        day = day.toString().length == 1 ? "0" + day : day;
        return this.getFullYear() + "-" + month + "-" + day;
    };

    const $script = $("script[src]");
    const src = $script[$script.length - 1].src;
    const scriptFolder = src.substr(0, src.lastIndexOf("/") + 1);
    angular.module("decorated-high-charts", ['ui.bootstrap', 'typeahead-focus']);
    angular.module("decorated-high-charts")
        .directive("decoratedHighCharts", function (chartDataUniverse, chartFactory, $timeout) {
            return {
                restrict: "E",
                scope: {
                    chartProperties: "=",
                    data: '=',
                    key: '@',
                    numericalColumns: "=",
                    categoricalColumns: '=',
                    customButtons: "=?",
                    apiHandle: '=',
                    /**
                     * Callback which should return the rows which are selected from the data
                     */
                    getSelectedRowsData: "&?",
                    showOnlySelectedRows: "=?",
                    /**
                     * Callback to call if a point on a scatterplot is clicked
                     */
                    scatterPlotPointClickCallback: "&?",
                    title: "@?",
                    /**
                     * Additional HighCharts options to layer on defaults
                     */
                    highchartOptions: "=?"
                },
                controller: function($scope, $element){
                    chartDataUniverse.setupUniverse($scope);
                    // Map colTags to actual objects as the dropdowns map by reference not by value
                    _.each(chartFactory.getRelevantProperties($scope.chartProperties), function(property){
                        $scope.chartProperties[property] = $scope.chartProperties[property] ?
                            _.findWhere($scope.numericalColumns.concat($scope.categoricalColumns),
                                {colTag: $scope.chartProperties[property].colTag}) :
                            undefined;
                    });
                },
                link: function (scope, elem, attrs) {
                    scope.chartId = _.uniqueId('decorated-highchart-');
                    scope.chartFactory = chartFactory;
                    scope.alerts = {
                        generalWarning: {active: false, message: ""}
                    };
                    scope.states = {
                        menuDisplays: {
                            moreOptions: false
                        }
                    };

                    // disable default right-click triggered context menu
                    //elem.bind('contextmenu', function () {
                    //    return false;
                    //});

                    /**
                     * create a reusable context menu to be displayed
                     * at the user's discretion
                     */
                    //scope.$ctxMenu = dhc.buildContextMenuContainer(elem);

                    scope.toggleSlide = function (show, className) {
                        const camelCaseName = attrs.$normalize(className);
                        scope.states.menuDisplays[camelCaseName] = show;
                        var $ctrl = elem.find("." + className);
                        if (show) {
                            $ctrl.slideDown(500);
                            $ctrl.find("input").first().select();
                        }
                        else
                            $ctrl.slideUp(500);
                        // Since we are using some jQuery, after the end of $timeout a $apply is fired implicitly
                        $timeout(function () {});
                    };

                    scope.getRegressionText = function(){
                        return scope.chartProperties.regression ?
                            _.findWhere(chartFactory.regressionTypes, {tag: scope.chartProperties.regression}).text :
                            "No Regression";
                    };

                    /**
                     * turn each series's data into a HTML table
                     * and then export this table to Excel
                     */
                    scope.exportXLS = function () {
                        var html = dhc.seriesToHTML(scope.states.chart.series);
                        if (window.navigator.msSaveBlob)
                            window.navigator.msSaveBlob(new Blob([html]), "time-series-export.xls");
                        else
                            window.open('data:application/vnd.ms-excel,' + encodeURIComponent(html));
                    };

                    scope.apiHandle.api = {
                        loadChart: function(){
                            var opts = chartFactory.getHighchartOptions(scope.chartProperties, scope.showOnlySelectedRows);
                            opts.chart.renderTo = scope.chartId;
                            scope.states.chart = new Highcharts.Chart(opts);
                        },
                        timeoutLoadChart: function(){
                            $timeout(function(){
                                scope.apiHandle.api.loadChart();
                            });
                        }
                    };
                    /**
                     * initialization & initial rendering
                     */
                    $timeout(function () {
                        scope.apiHandle.api.loadChart();
                    });

                    // This is to remove any unexpected propagation from dropdowns
                    //elem.find(".floating-form").click(function (e) {
                    //    e.stopPropagation();
                    //});
                },
                templateUrl: scriptFolder.endsWith("src/") ? scriptFolder + "/templates/DecoratedHighCharts.html" : "DecoratedHighCharts.html"
            };
        })
        .directive("dhcClickOutside", function () {
            return {
                restrict: "A",
                scope: {
                    openState: '=dhcOpenState',
                    closeCallback: '&dhcCloseCallback'
                },
                link: function (scope, element) {
                    /**
                     * We use a state variable for clicking outside the element because if we use stopPropagation()
                     * we possibly stop other legitimate events from triggering.
                     */
                    var clickedOutside = true;

                    const documentClickHandler = function () {
                        if (clickedOutside && scope.openState)
                            scope.closeCallback();
                        clickedOutside = true;
                    };
                    $(document).click(documentClickHandler);

                    const elementClickHandler = function () {
                        clickedOutside = false;
                    };
                    element.click(elementClickHandler);

                    // Unbind click listeners when element is removed
                    scope.$on('$destroy', function () {
                        $(document).unbind("click", documentClickHandler);
                        element.unbind("click", elementClickHandler);
                    });
                }
            }
        });
}());

(function () {
    const root = this; // this == window
    const dsc = root.dsc || {};
    root.dsc = dsc;
    /**
     * takes an array of Highcharts.Series and serialize them into HTML text wrapped in a table
     * @param series
     * @return {string}
     */
    dsc.seriesToHTML = function (series) {
        // construct header row
        const headers = "<tr>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>Date</th>" +
            _.map(series, function (s) {
                return "<th style='background-color: #0069d6; color: #ffffff;'>" + s.name + "</th>";
            }).join("") + "</tr>";
        // construct a union of all X values
        const domain = _.chain(series).map(function (s) {
            return _.map(s.data, function (datum) {
                return datum.x;
            });
        }).flatten().uniq().value();
        // construct an array lookup map for each series, mapping from x->y
        const matrix = _.map(series, function (s) {
            return _.chain(s.data).map(function (datum) {
                return [datum.x, datum.y];
            }).object().value();
        });
        // turn the lookup map into HTML
        const body = _.map(domain, function (x) {
            return "<tr>" +
                "<td style='background-color: #999999'>" + moment(x).format("YYYY-MM-DD") + "</td>" +
                _.map(matrix, function (col) {
                    return "<td>" + (col[x] && col[x] !== undefined && col[x] !== 'undefined' ? col[x] : 0) + "</td>";
                }).join("")
                + "</tr>";
        }).join("\n");

        return "<table>" +
            headers +
            body +
            "</table>";
    }
}());

/**
 * this module exposes the 'dhc' object which contains utility and helper functions for the main angular directive
 */
(function () {
    const root = this; // this == window
    const dhc = root.dhc || {};
    root.dhc = dhc;

    /**
     * choose the correct yAxis to add a new series into
     * if no preferred axis is found return -1
     * @param chart
     * @param seriesOption
     */
    root.dhc.resolvePreferredYAxis = function (chart, seriesOption) {
        if (!seriesOption.axisType)
            return chart.yAxis.length === 0 ? -1 : 0;
        return _.findIndex(chart.yAxis, function (axis) {
            return axis.userOptions.axisType === seriesOption.axisType;
        });
    };

    /**
     * Add a new axis to the given chart. wires up event handler and such.
     * axis are also labeled with axisType, which enables intelligent axis
     * selection when new series is being added
     *
     * @param chart a Highchart object
     * @param name the name of the axis
     * @param scope the scope object (we need this for the axis click event handler)
     * @param axisType a member of the axisType enum
     * @return {string}
     */
    root.dhc.addAxisToChart = function (chart, name, scope, axisType) {
        const axisId = _.uniqueId("yAxis");
        chart.addAxis({
            title: {
                text: name,
                events: {
                    click: function (event) {
                        dhc.onAxisClick.call(this, event, scope);
                    }
                }
            },
            axisType: axisType,
            opposite: chart.axes.length % 2 == 0,
            id: axisId
        });
        return chart.get(axisId);
    };

    /**
     * attaches event listener that triggers a context menu appearance when legend item is right-clicked
     * @param series
     * @param scope
     */
    root.dhc.attachLegendEventHandlers = function (series, scope) {
        $(series.legendItem.element)
            .css({"user-select": "none"})
            .mousedown(function (event) {
                if (event.button == 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    return dhc.triggerSeriesContextMenu(event, {
                        series: series,
                        scope: scope
                    });
                }
            })
    };

    /**
     * handles user click on an axis
     * @param event
     * @param scope
     */
    root.dhc.onAxisClick = function (event, scope) {
        event.preventDefault();
        event.stopPropagation();

        const axis = this;
        // empty existing context menu - add axis specific menu items
        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();

        function removeAxis() {
            return $("<li><a><i class='fa fa-remove'></i>&nbsp;Remove Axis</a></li>")
                .click(function () {
                    /**
                     * remove any series that is on the axis
                     */
                    while (axis.series && axis.series.length !== 0)
                        scope.removeSeries(axis.series[0]);
                    axis.remove();
                });
        }

        function editAxisTitle() {
            const $input = $("<input type='text' class='form-control' style='position:relative; left: 10%; width: 80%;'/>");
            $input.val(axis.axisTitle.textStr);
            $input.on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    axis.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                }
            });
            const $menuItem = $("<li><span></span></li>")
                .click(dhc.inertClickHandler);
            $menuItem.children("span").append($input);
            //$menuItem.css({"min-width": $input.val().length + "em"});
            return $menuItem;
        }

        $ctxMenu.children(".dropdown-menu")
            .append(editAxisTitle())
            .append(removeAxis());

        dhc.showCtxMenu($ctxMenu, event);
        // focus on the edit axis title input
        $ctxMenu.find("input.form-control").select();
    };

    /**
     * show the given context menu by figuring out the proper position
     * so that it does not appear off-screen
     * @param $ctxMenu
     * @param event
     */
    root.dhc.showCtxMenu = function ($ctxMenu, event) {
        $ctxMenu.show();
        const $rootDiv = $('div.root');

        const ctnRight = $rootDiv.position().left + $rootDiv.width();
        const menuRight = event.clientX + $ctxMenu.children().width();

        const ctnBtm = $rootDiv.position().top + $rootDiv.height();
        const menuBtm = event.clientY + $ctxMenu.children().height();

        var left = event.clientX;
        if (menuRight > ctnRight)
            left = Math.max(event.clientX - $ctxMenu.children().width(), 0);

        var top = event.clientY;
        if (menuBtm > ctnBtm)
            top = event.clientY - $ctxMenu.children().height();

        $ctxMenu.css({
            top: top + "px",
            left: left + "px"
        });
    };

    /**
     * a click event handler that does nothing and prevents propagation
     * @param e
     */
    root.dhc.inertClickHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
    };

    /**
     * moves an series from its current axis to the specified axis
     * @param series
     * @param targetAxis
     * @param scope
     */
    root.dhc.moveAxis = function (series, targetAxis, scope) {
        const origAxis = series.yAxis;
        const seriesOptions = series.options;
        // figure out the position
        seriesOptions.yAxis = _.findIndex(scope.states.chart.yAxis, function (x) {
            return x.userOptions.id == targetAxis.userOptions.id;
        });
        seriesOptions.color = series.color;
        series.remove();
        scope.addSeries(seriesOptions);
        if (dhc.isAxisEmpty(origAxis))
            origAxis.remove();

    };

    /**
     * generates the Series ID for security time series
     * @param security
     * @param attr
     * @returns {string}
     */
    root.dhc.generateSeriesID = function (security, attr) {
        return ["Security", security.id, attr.tag].join(".");
    };

    /**
     * this is the event handler for the user clicking on the chart title
     */
    root.dhc.onTitleClick = function (clickEvent, scope, chart) {

        const $input = $("<input class='form-control' style='position:relative; left: 5%; width: 90%;'/>");
        const $menuItem = $("<li><span></span></li>");
        $menuItem.on('click', dhc.inertClickHandler).children("span").append($input);

        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        $ctxMenu.children(".dropdown-menu").append($menuItem);

        $input
            .on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") { // ENTER
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    chart.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                } else if (keyEvent.keyCode == 27) // ESCAPE
                    $ctxMenu.hide();
            })
            .val(chart.options.title.text);

        const titleLength = Math.min($input.val().length, 20);
        $menuItem.css({"min-width": titleLength + "em"});

        dhc.showCtxMenu($ctxMenu, clickEvent);
        $input.select();
    };
    /**
     * test if the given series is the only one left on the given yAxis
     * @param yAxis
     */
    root.dhc.isAxisEmpty = function (yAxis) {
        return yAxis && yAxis.series.length === 0;
    };

    root.dhc.afterSeriesRemove = function (yAxis, securityId, scope) {

        function hasNoSeries(securityId) {
            const chart = scope.states.chart;
            return _.filter(chart.series, function (series) {
                    return series.userOptions.securityId
                        && series.userOptions.securityId === securityId;
                }).length === 0;
        }

        // figure out if this is the last series on its given axis, if so remove the axis
        if (dhc.isAxisEmpty(yAxis))
            yAxis.remove();
        // figure out if this is the last series for the given security, if so remove the security
        if (securityId && hasNoSeries(securityId))
            scope.apiHandle.api.removeSecurity(securityId);
    };

    root.dhc.removeSeriesById = function (id, scope) {

        const chart = scope.states.chart;
        const series = chart.get(id);
        const yAxis = series.yAxis;
        const securityId = series.options.securityId;

        if (angular.isFunction(series.remove))
            series.remove();

        dhc.afterSeriesRemove(yAxis, securityId, scope);
    };


    /**
     * generator function for SMA. Credit: Rosetta Code
     * @param period MA of this period will be taken by the resulting function
     * @returns {Function}
     */
    root.dhc.SMAFactory = function (period) {
        var nums = [];
        return function (num) {
            nums.push(num);
            if (nums.length > period)
                nums.splice(0, 1);  // remove the first element of the array
            var sum = 0;
            for (var i in nums)
                sum += nums[i];
            var n = period;
            if (nums.length < period)
                n = nums.length;
            return (sum / n);
        }
    }
}());

(function () {
    const root = this; // this == window
    const dsc = root.dsc || {};
    root.dsc = dsc;

    /**
     * create the reusable context menu
     * this menu becomes visible when user right-clicks
     * the legend. The menu items in this menu is dynamically generated
     * at the time the right-click event is generated
     *
     * @param elem the parent element to attach the generated context menu
     * @returns {*|jQuery}
     */
    root.dsc.buildContextMenuContainer = function (elem) {
        const $ctxMenu = $(
            "<div style='z-index: 10; position: fixed;'>" +
            "<ul class='clickable dropdown-menu multi-level' style='display: block;'></ul>" +
            "</div>"
        ).hide();
        $ctxMenu.prependTo(elem.children(".root"));
        $(window).click(function () {
            $ctxMenu.hide();
        });
        return $ctxMenu;
    };

    /**
     * event handler for trigger a context menu that is series specific
     * (i.e. right-clicking on a legend or clicking on a series)
     * this code executed when the legend is right-clicked, therefore
     * this is when we mutate the DOM (not before)

     * @param event the mouse click event
     * @param args additional args, containing the series and the scope
     * @returns {boolean}
     */
    root.dsc.triggerSeriesContextMenu = function (event, args) {
        const $ctxMenu = args.scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        _.each(dsc.buildMenuItems(args), function (menuItem) {
            $ctxMenu.children(".dropdown-menu").append(menuItem);
        });
        dsc.showCtxMenu($ctxMenu, event);
        return false;
    };

    /**
     * resolve the correct context menu items given the series
     * @param args
     * @returns {*[]}
     */
    root.dsc.buildMenuItems = function (args) {
        const scope = args.scope;
        const seriesTransformer = scope.seriesTransformer;
        const series = args.series;
        const disableTransformation = series.options.disableFurtherTransformation;
        const chart = scope.states.chart;

        /**
         * creates menu item and submenus for transformer functions (i.e. moving avgs etc)
         * @param transformFn
         * @param text
         * @returns {*|jQuery}
         */
        function transformerMenuItemGenerator(transformFn, text) {
            const $input = $("<input type='text' placeholder='Day(s)' class='form-control' style='position: relative; width: 80%; left: 10%;'/>");
            return $("<li class='dropdown-submenu'><a>" + text + "</a></li>")
                .click(function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    $input.focus();
                })
                .append($("<li class='dropdown-menu'><span></span></li>")
                    .click(dsc.inertClickHandler)
                    .append($input.on('keydown', function (keyEvent) {
                        if (keyEvent.keyCode == 13) {
                            if (isNaN(parseInt($input.val())) || $input.val() == '')
                                return;
                            const transformedSeries = transformFn(series, parseInt($input.val()));
                            transformedSeries.disableFurtherTransformation = true;
                            scope.addSeries(transformedSeries);
                            scope.$ctxMenu.hide();
                        }
                    })));
        }

        const addMA = transformerMenuItemGenerator.bind(null, seriesTransformer.toSimpleMA, "Add Simple MA");

        const basis = function () {
            return $("<li class='dropdown-submenu'><a>Show Basis vs. </a></li>")
                .append(dsc.buildSeriesSubMenu({
                    scope: scope,
                    onClick: function (event, otherSeries) {
                        const transformedSeries = seriesTransformer.toBasis(series, otherSeries);
                        scope.addSeries(transformedSeries);
                    },
                    currentSeries: series
                }));
        };

        function changeType() {
            const $subMenu = $("<ul class='dropdown-menu'></ul>");
            _.chain([['Line', 'spline', 'line-chart'], ['Area', 'areaspline', 'area-chart'], ['Column', 'column', 'bar-chart']])
                .filter(function (type) {
                    return type[1] !== series.type;
                })
                .each(function (type) {
                    $("<li><a><i class='fa fa-" + type[2] + "'></i>&nbsp;" + type[0] + "</a></li>")
                        .click(function () {
                            series.update({type: type[1]});
                            // for some chart update wipes out legend event handler
                            // so we reattach them here
                            dsc.attachLegendEventHandlers(series, scope);
                        }).appendTo($subMenu);
                });
            return $("<li class='dropdown-submenu'><a>Change Chart Type</a></li>").append($subMenu);
        }

        const removeSeries = function () {
            return $("<li><a>Remove</a></li>").click(function () {
                scope.$apply(function () {
                    scope.removeSeries(series);
                });
            });
        };
        const changeAxis = function () {
            return $("<li class='dropdown-submenu'><a>Change Axis</a></li>")
                .append(dsc.buildAxesSubMenu(series, chart, scope));
        };
        return disableTransformation ? [changeAxis(), basis(), changeType(), removeSeries()]
            : [changeAxis(), addMA(), basis(), changeType(), removeSeries()];
    };

    /**
     * create a sub dropdown for every series in the chart. the functionality of
     * clicking on the menu items in this dropdown will be provided as callbacks
     * since there could be multiple behaviors
     *
     * if args contain a 'currentSeries' property, which is assumed to be of the type Highchart.Series,
     * then this series will not be included in the resulting submenu
     *
     * @param args
     */
    root.dsc.buildSeriesSubMenu = function (args) {
        const chart = args.scope.states.chart;
        const callback = args.onClick;
        const currentSeries = args.currentSeries;
        const $subMenu = $("<ul class='dropdown-menu'></ul>");
        const filteredSeries = _.filter(chart.series, function (series) {
            return currentSeries && series.options.id !== currentSeries.options.id;
        });
        if (filteredSeries.length == 0)
            $subMenu.append("<li><a>No Other Series to Compare To</a></li>");
        else
            _.each(filteredSeries, function (series) {
                $("<li><a>" + series.name + "</a></li>")
                    .click(function (event) {
                        callback(event, series);
                    }).appendTo($subMenu);
            });

        return $subMenu;
    };

    /**
     * create a sub dropdown for every axes in the chart
     * each item in the dropdown triggers a migration of the
     * given series to the axis represented by the item
     * @param series
     * @param chart
     * @param scope
     */
    root.dsc.buildAxesSubMenu = function (series, chart, scope) {
        const $dropdown = $("<ul class='dropdown-menu'></ul>");
        _.each(chart.yAxis, function (axis) {
            var $menuItem;
            if (axis.userOptions.id === series.yAxis.userOptions.id)
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "&nbsp;<i class='fa fa-check'></i></a></li>");
            else
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "</a></li>")
                    .click(function () {
                        dsc.moveAxis(series, axis, scope);
                    });
            $dropdown.append($menuItem);
        });
        $dropdown.append($("<li><a><i class=\"fa fa-plus\"></i> Move To New Axis</a></li>").click(function () {
            const axis = dsc.addAxisToChart(chart, series.name, scope, series.userOptions.axisType);
            dsc.moveAxis(series, axis, scope);
        }));
        return $dropdown;
    };

}());
angular.module("decorated-stock-chart").run(["$templateCache", function($templateCache) {$templateCache.put("DecoratedStockChart.html","<div class=\"root\" style=\"position: relative\">\r\n    <div class=\"control flex-main-container\"\r\n         ng-init=\"showSecurityControl = false; showIndicatorControl = false; showBenchmarkControl = false;\">\r\n        <span class=\"flex-sub-container-left\">\r\n            <!-- security & attributes selection -->\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.securityControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.securityControl, \'security-control\')\">\r\n                <span class=\"restrict-dropdown-menu\">\r\n                    <input type=\"text\" ng-model=\"defaultSecurityAttribute\" class=\"form-control\"\r\n                           style=\"width: 12em; display: inline; height:25px;\"\r\n                           typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                           typeahead-focus\r\n                           typeahead-select-on-blur=\"true\"/>\r\n                </span>\r\n                <a><i ng-click=\"toggleSlide(!states.menuDisplays.securityControl, \'security-control\')\"\r\n                      class=\"fa clickable\"\r\n                      ng-class=\"{\'fa-chevron-up\': states.menuDisplays.securityControl, \'fa-chevron-down\': !states.menuDisplays.securityControl}\"></i></a>\r\n                <div class=\"security-control floating-form\" style=\"display: none;top:35px;left:0;\">\r\n                    <div ng-show=\"states.securityAttrMap.length === 0\">\r\n                        <h5>No Security Selected</h5>\r\n                    </div>\r\n                    <div class=\"flex-container\">\r\n                        <span class=\"wrappable-flex-item\" ng-repeat=\"securityAttrPair in states.securityAttrMap\">\r\n                            <!-- selected attributes display -->\r\n                            <span class=\"label label-success\">{{securityAttrPair[0].label}} | <i class=\"fa fa-remove clickable\"\r\n                                                                                                 ng-click=\"apiHandle.api.removeSecurity(securityAttrPair[0].id)\"></i></span>\r\n                            <span class=\"label label-primary\" ng-repeat=\"attr in securityAttrPair[1]\">\r\n                                    {{attr.label}} | <i class=\"fa fa-remove clickable\"\r\n                                                        ng-click=\"removeAttr(attr, securityAttrPair)\"></i>\r\n                            </span>\r\n                            <!-- input to select more attributes-->\r\n                            &nbsp;\r\n                            <input type=\"text\"\r\n                                   placeholder=\"+ Attribute\"\r\n                                   ng-model=\"selected\"\r\n                                   typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   class=\"form-control\"\r\n                                   style=\"width: 8em; display: inline;\"\r\n                                   typeahead-on-select=\"addAttr($item, securityAttrPair); selected = \'\'\"\r\n                                   typeahead-focus>\r\n\r\n                        </span>\r\n                    </div>\r\n                </div>\r\n            </span>\r\n            <!-- TODO implement these date functionalities -->\r\n            <span style=\"padding-left:25px;\">\r\n                <span class=\"clickable dsc-padding-right\" ng-repeat=\"period in customDefaultTimePeriods\" ng-click=\"selectTimePeriod(period)\"\r\n                      style=\"padding-right:5px;color:#005da0;\">\r\n                    {{period}}\r\n                </span>\r\n                <span style=\"color:#005da0;overflow: hidden\"\r\n                      dsc-click-outside\r\n                      dsc-open-state=\"states.menuDisplays.dateControl\"\r\n                      dsc-close-callback=\"toggleSlide(!states.menuDisplays.dateControl, \'date-control\')\">\r\n                    <i class=\"fa fa-calendar clickable\" ng-click=\"toggleSlide(!states.menuDisplays.dateControl, \'date-control\');\r\n                             start = states.dateRange.start.getYYYYMMDD();\r\n                             end = states.dateRange.end.getYYYYMMDD()\"></i>\r\n                    <div class=\"date-control floating-form\" style=\"display: none;\">\r\n                        <alert ng-show=\"alerts.dateChangeError.active\" close=\"alerts.dateChangeError.active = false\" type=\"danger\" style=\"font-size: 12px;\">\r\n                            {{alerts.dateChangeError.message}}\r\n                            <br/>\r\n                            Format: YYYY-MM-DD\r\n                        </alert>\r\n                        <label>From&nbsp;</label>\r\n                        <div class=\"input-group limited-input\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   datepicker-popup\r\n                                   is-open=\"startDatePickerOpen\"\r\n                                   ng-model=\"start\"\r\n                                   close-text=\"Close\"/>\r\n                            <span class=\"input-group-btn\">\r\n                                <button type=\"button\" class=\"btn btn-default\" ng-click=\"startDatePickerOpen = !startDatePickerOpen\"><i class=\"fa fa-calendar\"></i></button>\r\n                            </span>\r\n                        </div>\r\n                        <label>To&nbsp;</label>\r\n                        <div class=\"input-group limited-input\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   datepicker-popup\r\n                                   is-open=\"endDatePickerOpen\"\r\n                                   ng-model=\"end\"\r\n                                   close-text=\"Close\"/>\r\n                            <span class=\"input-group-btn\">\r\n                                <button type=\"button\" class=\"btn btn-default\" ng-click=\"endDatePickerOpen = !endDatePickerOpen\"><i class=\"fa fa-calendar\"></i></button>\r\n                            </span>\r\n                        </div>\r\n                        <hr/>\r\n                        <button class=\"btn btn-success\"\r\n                                ng-click=\"alerts.dateChangeError.message = apiHandle.api.changeDateRange(start, end);\r\n                                          alerts.dateChangeError.message ? null : showDateControl = !showDateControl;\">\r\n                            <i class=\"fa fa-play\"></i>\r\n                        </button>\r\n                    </div>\r\n                </span>\r\n            </span>\r\n        </span>\r\n        <span class=\"flex-sub-container-right\">\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.indicatorControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.indicatorControl,\'indicator-control\')\">\r\n                <a class=\"clickable\" style=\"text-decoration:none\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.indicatorControl,\'indicator-control\');selected=\'\';\">\r\n                    <span class=\"fake-anchor-tag\">Market Indicators</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.indicatorControl, \'fa-chevron-down\': !states.menuDisplays.indicatorControl}\"></i>\r\n                </a>\r\n                <div class=\"indicator-control floating-form\" style=\"display: none;width:250px;\">\r\n                    <label>\r\n                        Search&nbsp;\r\n                    </label>\r\n                    <span class=\"restrict-dropdown-menu\">\r\n                        <input type=\"text\" placeholder=\"ex: S&P 500, Energy CDS...\" class=\"form-control\"\r\n                                   ng-model=\"selected\"\r\n                                   typeahead=\"attr.label for attr in marketIndexTypeahead({userInput: $viewValue}) | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   typeahead-on-select=\"apiHandle.api.addMarketIndicator($item); selected = \'\';showIndicatorControl = false;\"\r\n                                   typeahead-focus/>\r\n                    </span>\r\n                    <a class=\"clickable\" ng-if=\"showMoreMarketInfo\" ng-click=\"moreMarketInfoCallback()\">Show All</a>\r\n                </div>\r\n            </span>\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.benchmarkControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.benchmarkControl, \'benchmark-control\')\"\r\n                    style=\"padding-right:10px\" ng-init=\"customBenchmark = {}\">\r\n                <a class=\"clickable\" style=\"padding-left:5px;text-decoration:none;\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.benchmarkControl, \'benchmark-control\');customBenchmark = {};\">\r\n                    <span class=\"fake-anchor-tag\">Benchmark</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.benchmarkControl, \'fa-chevron-down\': !states.menuDisplays.benchmarkControl}\"></i>\r\n                </a>\r\n                <div class=\"benchmark-control floating-form\" style=\"display: none;\">\r\n                    <alert ng-show=\"alerts.customBenchmark.active\" close=\"alerts.customBenchmark.active = false\" type=\"danger\" style=\"font-size: 12px;\">\r\n                        There were problems with your input\r\n                        <br/><br/>\r\n                        <ul style=\"list-style:inside;padding-left:0;\">\r\n                            <li ng-repeat=\"message in alerts.customBenchmark.messages\">{{message}}</li>\r\n                        </ul>\r\n                    </alert>\r\n                    <label>\r\n                        Sector&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.sector\"\r\n                                   typeahead=\"sector for sector in customBenchmarkOptions.sectors | filter:$viewValue:$emptyOrMatch | orderBy:\'toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        Rating&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.rating\"\r\n                                   typeahead=\"rating for rating in customBenchmarkOptions.ratings | filter:$viewValue:$emptyOrMatch | orderBy:\'toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        WAL&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.wal\"\r\n                                   typeahead=\"wal for wal in customBenchmarkOptions.wal | filter:$viewValue:$emptyOrMatch | orderBy:sortWalBuckets\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        Analytic&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.analytic\"\r\n                                   typeahead=\"attr as attr.label for attr in customBenchmarkOptions.analytics | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <button class=\"btn btn-success\" ng-click=\"apiHandle.api.addCustomBenchmark(customBenchmark)\"><i\r\n                            class=\"fa fa-play\"></i></button>\r\n                </div>\r\n            </span>\r\n            <span>\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-click=\"exportXLS()\"><i class=\"fa fa-share-square-o\"></i></span>\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-repeat=\"customButton in customButtons\" ng-click=\"customButton.callback()\">\r\n                    <i class=\"fa\" ng-class=\"customButton.faClass\"></i>\r\n                </span>\r\n            </span>\r\n        </span>\r\n    </div>\r\n    <hr/>\r\n    <div style=\"position:relative\">\r\n        <i ng-show=\"isProcessing\" class=\"fa fa-spinner fa-spin fa-3x spinner\" style=\"position:absolute;top:0;left:0\"></i>\r\n        <!-- this is where the stock chart goes -->\r\n        <div ng-attr-id=\"{{\'enriched-highstock-\'+id}}\" style=\"width:100%;height:100%;\"></div>\r\n        <alert ng-show=\"alerts.generalWarning.active\" style=\"position:absolute;bottom:0;right:0;\"\r\n               close=\"alerts.generalWarning.active = false\" type=\"danger\">\r\n            {{alerts.generalWarning.message}}\r\n        </alert>\r\n    </div>\r\n</div>\r\n");}]);