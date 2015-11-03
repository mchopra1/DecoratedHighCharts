(function () {
    const root = this; // this == window
    const dhc = root.dhc || {};
    root.dhc = dhc;

    function extractHtmlFromScatter(chart){
        var headers = "", body = "";
        // Construct first row of names of series
        headers = "<tr>" + _.map(chart.series, function(ser){
            return "<th colspan='2' style='background-color: #0069d6; color: #ffffff;'>" + ser.name + "</th>"
        }).join('') + "</tr>";

        // Construct second row of x & y titles
        headers += "<tr>" + _.map(chart.series, function(){
                return "<th style='background-color: #7fb4ea;'>" + chart.options.xAxis[0].title.text + " (x)</th>" +
                       "<th style='background-color: #7fb4ea;'>" + chart.options.yAxis[0].title.text + " (y)</th>";
        }).join('') + "</tr>";

        // Get longest length of data array for all series in this chart
        const maxLength = _.chain(chart.series).map(function(ser){
            return ser.data.length;
        }).value().sort(function(a, b){return b-a})[0];

        // Construct data
        body = _(maxLength).times(function(index){
            var row = "<tr>";
            row += _.map(chart.series, function(ser){
                var cellX = "<td>" + (ser.data.length > index ? ser.data[index].x : "") + "</td>";
                var cellY = "<td>" + (ser.data.length > index ? ser.data[index].y : "") + "</td>";
                return cellX + cellY;
            }).join('');
            row += "</tr>";
            return row;
        }).join('');
        return headers + body;
    }

    function extractHtmlFromColumn(chart){
        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'></th>" + _.map(chart.series, function(ser){
                return "<th style='background-color: #0069d6; color: #ffffff;'>" + ser.name + "</th>"
            }).join('') + "</tr>";

        // Construct data
        var body = _.map(chart.xAxis[0].categories, function(category){
            var cells = "<td>" + category + "</td>";
            cells += _.map(chart.series, function(ser){
                var foundCategory = _.findWhere(ser.data, {category: category});
                return "<td>" + (foundCategory && foundCategory.y ? foundCategory.y : "") + "</td>";
            }).join('');
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }

    function extractHtmlFromPie(chart){
        var groupingBy = chart.options.title.text.split(" weighted by ")[1];

        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'>" + chart.series[0].name + "</th>" +
                  "<th style='background-color: #0069d6; color: #ffffff;'>" + groupingBy + "%</th>" +
                  "<th style='background-color: #0069d6; color: #ffffff;'>Total " + groupingBy + "</tr>";

        // Construct data
        var body = _.map(chart.series[0].data, function(datum){
            var cells = "<td>" + datum.name + "</td>";
            cells += "<td>" + datum.percentage + "</td>";
            cells += "<td>" + datum.y + "</td>";
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }

    function extractHtmlFromBoxPlot(chart){
        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'>" + chart.options.xAxis[0].title.text + "</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" + chart.options.yAxis[0].title.text + " Low</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Q1</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Median</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Q3</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " High</th>";

        // Construct data
        var body = _.map(chart.series[0].data, function(datum){
            var cells = "<td>" + datum.category + "</td>";
            cells += "<td>" + datum.low + "</td>";
            cells += "<td>" + datum.q1 + "</td>";
            cells += "<td>" + datum.median + "</td>";
            cells += "<td>" + datum.q3 + "</td>";
            cells += "<td>" + datum.high + "</td>";
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }
    /**
     * takes an array of Highcharts.Series and serialize them into HTML text wrapped in a table
     * @param series
     * @return {string}
     */
    dhc.chartToHTML = function (chart) {
        var html = "";
        if( chart.series.length > 0) {
            switch (chart.options.chart.type) {
                case "scatter":
                    html = extractHtmlFromScatter(chart);
                    break;
                case "column":
                    html = extractHtmlFromColumn(chart);
                    break;
                case "pie":
                    html = extractHtmlFromPie(chart);
                    break;
                case "boxplot":
                    html = extractHtmlFromBoxPlot(chart);
                    break;
                default:
                    break;
            }
        }
        return "<table>" + html + "</table>";
    }
}());
