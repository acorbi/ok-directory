var nd;

$(function(){
    nd = new Pyk.newsDiscovery();
    nd.init();
});

var Pyk = {};
var id_tags;
var mapViewOn = false;
var articles = new Object();
var activeArticle;

Pyk.newsDiscovery = function(){

    this.init = function(){

        // Load Facets & Render
        $.getJSON('res/data/facet.json', function(json){
            nd.facet = json;
            nd.renderColHeadings();
        });

        //Get the data from directory
        superagent.get(window.plp.config.directory.url)
          .set('Accept', 'application/json')
          .end(function(res){

            if (res.ok) {

              var graphObject = JSON.parse(res.text);
              var graph = graphObject["@graph"];
              nd.data = graph;
              nd.initCrossfilter();
              nd.initMap();
              nd.countArticles();
              nd.renderTags();
              nd.initSearch();

            } else {
              alert('Oh no! error ' + res.text);
            }

        });

    };

    this.countArticles = function(){

      var nPersons = 0;
      var nOrganizations = 0;
      var nPlaces = 0;

      for (profile in this.data){
        if (this.data[profile]["about"]["type"]=="Person"){
          nPersons++;
        }else if (this.data[profile]["about"]["type"]=="Organization"){
          nOrganizations++;
        }else if (this.data[profile]["about"]["type"]=="Place"){
          nPlaces++;
        }
      }

      $(".slogan").html("<div ><h3 class=\"left\">"+nPersons+" Individuals</h3><h3 class=\"left\">"+nOrganizations+" Organizations</h3><h3 class=\"left\">"+nPlaces+" Places</h3>");

    }


    this.renderColHeadings = function(){
        var h5s = $(".tag-holder h5"); // Capture all the required <h5> tags
        var f = this.facet.children;  // Get the data nd corresponds to it
        for(var i in f) $(h5s[i]).html(f[i].label);
    };


    this.initCrossfilter = function(){

      // this.data contains the array of profiles.
      this.cf = {};
      this.cf.data = crossfilter(this.data);

      this.cf.id_dimension = this.cf.data.dimension(function(d){
        if (!d["about"]["name"])
          return "N/A";
        articles[d["about"]["name"]] = d;
        return d["about"]["name"];
      });

      this.cf.dd_dimension = this.cf.data.dimension(function(d){
        if (!d["about"]["address"])
          return "N/A";
        return d["about"]["address"]["addressCountry"];
      });

      this.cf.ee_dimension = this.cf.data.dimension(function(d){
        if (!d["about"]["address"])
          return "N/A";
        return d["about"]["address"]["addressLocality"];
      });

      this.cf.ff_dimension = this.cf.data.dimension(function(d){

        if (d["about"]["type"] == "Organization"){
          if (!d["about"]["name"])
            return "N/A";
          return d["about"]["name"];
        }else if(d["about"]["type"] == "Person"){
          if (!d["about"]["memberOf"][0])
            return "N/A";
          return d["about"]["memberOf"][0]["name"];
        }else if(d["about"]["type"] == "Place"){
          if (!d["about"]["name"])
            return "N/A";
          return d["about"]["name"];
        }

      });

      // We need 2 identical dimensions for the numbers to update
      // See http://git.io/_IvVUw for details
      this.cf.aa_dimension = this.cf.data.dimension(function(d){
        if (!d["about"]["interest"] || !d["about"]["interest"][0])
          return "N/A";
        return d["about"]["interest"][0]["name"];
      });

      // This is the dimension nd we'll use for rendering
      this.cf.aar_dimension = this.cf.data.dimension(function(d){
        if (!d["about"]["interest"] || !d["about"]["interest"][0])
          return "N/A";
        return d["about"]["interest"][0]["name"];
      });

      // Create empty filter roster
      this.activeFilters = {

          "dd": [], // Country
          "ee": [], // City
          "ff": [], // Organization
          "aa": [], // Skills
          "id": []  // id
      };

    };

    this.renderTags = function(){

      // Country
      var dd_tags = nd._removeEmptyKeys(nd.cf.dd_dimension.group().all(), "dd");
      var dd_list = d3.select("#table1").selectAll("li").data(dd_tags,function(d){
        return d.key;
      });
      dd_list.enter().append("li").html(function(d){
            var link = "<a href='#'>" + d.key;
            link += "<span class='badge'>" + d.value + "</span>";
            link += "</a>";
            return link;
          })
          .on("click", function(d){
            $(this).toggleClass("active");
            nd.filter("dd", d.key);
          });
      dd_list.exit().remove();

      // City
      var ee_tags = nd._removeEmptyKeys(nd.cf.ee_dimension.group().all(), "ee");
      var ee_list = d3.select("#table2").selectAll("li").data(ee_tags,function(d){
        return d.key;
      });
      ee_list.enter().append("li").html(function(d){
            var link = "<a href='#'>" + d.key;
            link += "<span class='badge'>" + d.value + "</span>";
            link += "</a>";
            return link;
          })
          .on("click", function(d){
            $(this).toggleClass("active");
            nd.filter("ee", d.key);
          });
      ee_list.exit().remove();

      // Organization
      var ff_tags = nd._removeEmptyKeys(nd.cf.ff_dimension.group().all(), "ff");
      var ff_list = d3.select("#table3").selectAll("li").data(ff_tags,function(d){
        return d.key;
      });
      ff_list.enter().append("li").html(function(d){
            var link = "<a href='#'>" + d.key;
            link += "<span class='badge'>" + d.value + "</span>";
            link += "</a>";
            return link;
          })
          .on("click", function(d){
            $(this).toggleClass("active");
            nd.filter("ff", d.key);
          });
      ff_list.exit().remove();

      // Skills
      var aa_tags = nd._aaReduce(nd.cf.aar_dimension.groupAll().reduce(reduceAdd, reduceRemove, reduceInitial).value());
      var aa_list = d3.select("#table4").selectAll("li").data(aa_tags,function(d){
        return d.key;
      });
      aa_list.enter().append("li").html(function(d){
            var link = "<a href='#'>" + d.key;
            link += "<span class='badge'>" + d.value + "</span>";
            link += "</a>";
            return link;
          })
          .on("click", function(d){
            $(this).toggleClass("active");
            nd.filter("aa", d.key);
          });
      aa_list.exit().remove();

      // Before rendering the Grid, we have to clear the layerGroup in the map instance in order to display new markers
      clearLayers();

      // Grid at the bottom
      id_tags = nd._removeEmptyKeys(nd.cf.id_dimension.group().all(), "id");
      d3.select("#grid").selectAll("div").remove();
      var grid_list = d3.select("#grid").selectAll("div").data(id_tags);
      grid_list.enter().append("div").html(function(d,i){
        var article = nd._findArticleById(d.key);
        var lastOne = i==grid_list[0].length-1 ? true : false;
        var cardHtml = nd._renderArticleCardPreview(article);
        codeAddressFromArticle(nd,article,lastOne);
        return cardHtml;
      }).on("click", function(d){
        var article = nd._findArticleById(d.key);
        nd._showArticleDetails(article);
      })
      .on("mouseover", function(d){
          var article = nd._findArticleById(d.key);
          panMapToArticle(nd,article);
      });

      grid_list.exit().remove();

      $(".card-photo").each(function (index){
        var articleId = $(this).attr("data-article-id");
        var article = nd._findArticleById(articleId);
        if (!nd._setProfileImageUrlPlace(article,$(this)))
          nd._setTwitterProfileImageUrl(article,$(this));
      });

    };

    this.filter = function(d, e){

      var i = nd.activeFilters[d].indexOf(e);
      if(i < 0){
          nd.activeFilters[d].push(e);
      }else{
          nd.activeFilters[d].splice(i, 1);
      }

      nd.cf.ee_dimension.filterAll();
      if(nd.activeFilters["ee"].length > 0){
          nd.cf.ee_dimension.filter(function(d){
              return nd.activeFilters["ee"].indexOf(d) > -1;
          });
      }

      nd.cf.dd_dimension.filterAll();
      if(nd.activeFilters["dd"].length > 0){
          nd.cf.dd_dimension.filter(function(d){
              return nd.activeFilters["dd"].indexOf(d) > -1;
          });
      }

      nd.cf.ff_dimension.filterAll();
      if(nd.activeFilters["ff"].length > 0){
          nd.cf.ff_dimension.filter(function(d){
              return nd.activeFilters["ff"].indexOf(d) > -1;
          });
      }

      nd.cf.id_dimension.filterAll();
      if(nd.activeFilters["id"].length > 0){
          nd.cf.id_dimension.filter(function(d){
              return nd.activeFilters["id"].indexOf(d) > -1;
          });
      }

      nd.cf.aa_dimension.filterAll();
      if(nd.activeFilters["aa"].length > 0){
          nd.cf.aa_dimension.filter(function(d){
              // d is the data of the dataset
              // f is the filters nd are applied
              var f = nd.activeFilters["aa"];

              var filter = true;
              for(var i in f){
                  if(d.indexOf(f[i]) < 0) filter = false;
              }

              return filter;
          });
      }

      nd.renderTags();
    };

    this.filterSearch = function(query){
      var article = nd.searchFilterArray[query];
      if(article.filter){
          nd.filter(article.filter,query);
          $("#searchField").val(query)
      }
      return query;
    }

    // Defines method for search and typeahead.
    this.initSearch = function(){

      nd.searchFilterArray = nd._buildSearchFilterArray();

      $('#searchField').typeahead({

        source: function (query, process) {
          var articleTitles = nd.searchFilterArray.articleTitles;
          process(articleTitles);
        },
        updater: function (item) {
          return nd.filterSearch(item);
        },
        matcher: function (item) {
          if (!item) return false;
          if (item.toLowerCase().indexOf(this.query.trim().toLowerCase()) != -1) {
            return true;
          }
        },
        sorter: function (items) {
          return items.sort();
        },
        highlighter: function (item) {
         var regex = new RegExp( '(' + this.query + ')', 'gi' );
         return item.replace( regex, "<strong>$1</strong>" );
        },

      });

    };

    // Defines method for search and typeahead.
    this.initMap = function(){
      initializeMap();
    }

    this._clearSearch = function(){
      nd.initCrossfilter();
      nd.renderTags();
      $("#searchField").val("");
    }

    $("#clearBtn").on('click',function(){
      nd._clearSearch();
    });

    $("#openJoinPageBtn").on('click',function(){
      nd._closeSidebar();
      $("#joinPage").fadeIn("slow");
      $('#addOrEdit').show();
    });

    $("#openInfoPageBtn").on('click',function(){
      nd._closeSidebar();
      $("#infoPage").fadeIn("slow");
    });

    $("#closePageBtn").on('click',function(){
      nd._openSidebar();
      $("#joinPage").hide();
      $("#infoPage").hide();
    });

    /*--------------------
      HELPERS
    --------------------*/

    this._afterRegisteringNewUser = function(){
      $("#joinPage").hide();
      nd._openSidebar();
      nd.init();
    }

    this._closeSidebar = function(){
      $("#left").removeClass("col-md-2").addClass("col-md-1");
      $("#middle").removeClass("col-md-10").addClass("col-md-11");
      $("#logo-text").hide();
      $("#header").hide();
      $("#map").hide();
      $("#grid").hide();
      $(".leftmenu").hide();
      $("#closePageBtn").show();
    }

    this._openSidebar = function(){
      $("#left").removeClass("col-md-1").addClass("col-md-2");
      $("#middle").removeClass("col-md-11").addClass("col-md-10");
      $("#logo-text").show();
      $("#header").show();
      $("#map").show();
      $("#grid").show();
      $(".leftmenu").fadeIn();
      $("#closePageBtn").hide();
    }

    this._renderArticleCardPreview = function(article){

      if (article["about"]["type"] == "Person"){

        return nd._renderArticleCardPreviewPerson(article);

      }else if (article["about"]["type"] == "Organization"){

        return nd._renderArticleCardPreviewOrganization(article);

      }else if (article["about"]["type"] == "Place"){

        return nd._renderArticleCardPreviewPlace(article);

      }

    }

    this._renderArticleCardPreviewPerson = function(article){

      var container = $("<div/>").addClass("card col-xs-2");

      var profileimg = $("<div/>").addClass("profileimage");
      container.append(profileimg);
      nd._setProfileImageUrlPerson(article,profileimg);

      var profileexcerpt = $("<div/>").addClass("profileexcerpt");
      container.append(profileexcerpt);

      if (article["about"]["name"])
        profileexcerpt.append("<b>" + article["about"]["name"] + "</b>");

      if (article["about"]["memberOf"][0])
        profileexcerpt.append($("<div/>").addClass("organisation").html(article["about"]["memberOf"][0]["name"]));

      if (article["about"]["address"])
        profileexcerpt.append($("<div/>").addClass("city").html(article["about"]["address"]["addressLocality"] + ", " + article["about"]["address"]["addressCountry"]).get(0));

      return container.get(0).outerHTML;

    }

    this._renderArticleCardPreviewOrganization = function(article){

      var container = $("<div/>").addClass("card col-xs-2");

      var profileimg = $("<div/>").addClass("profileimage");
      container.append(profileimg);
      nd._setProfileImageUrlOrganization(article,profileimg);

      var profileexcerpt = $("<div/>").addClass("profileexcerpt");
      container.append(profileexcerpt);

      if (article["about"]["name"])
        profileexcerpt.append("<b>" + article["about"]["name"] + "</b>");

      if (article["about"]["address"])
        profileexcerpt.append($("<div/>").addClass("addressLocality").html(article["about"]["address"]["addressLocality"] + ", " + article["about"]["address"]["addressCountry"]).get(0));

      return container.get(0).outerHTML;

    }

    this._renderArticleCardPreviewPlace = function(article){

      var container = $("<div/>").addClass("card col-xs-2");

      var profileimg = $("<div/>").addClass("profileimage");
      container.append(profileimg);
      nd._setProfileImageUrlPlace(article,profileimg);

      var profileexcerpt = $("<div/>").addClass("profileexcerpt");
      container.append(profileexcerpt);

      if (article["about"]["name"])
        profileexcerpt.append("<b>" + article["about"]["name"] + "</b>");

      if (article["about"]["address"])
        profileexcerpt.append($("<div/>").addClass("city").html(article["about"]["address"]["addressLocality"] + ", " + article["about"]["address"]["addressCountry"]).get(0));

      return container.get(0).outerHTML;

    }

    this._showArticleDetails = function(article){

       $('#article-card').modal('show');

       if (article["about"]["type"] == "Person"){

         return nd._renderArticleCardDetailsPerson(article);

       }else if (article["about"]["type"] == "Organization"){

         return nd._renderArticleCardDetailsOrganization(article);

       }else if (article["about"]["type"] == "Place"){

         return nd._renderArticleCardDetailsPlace(article);

       }

    }

    // Generates the HTML content of the card representation of the articles on the grid
    this._renderArticleCardDetailsPerson = function(article){

      $("#article-card-left").empty();
      $("#article-card-right").empty();

      var profileimg = $("<div/>").addClass("profileimage");
      var img = $("<img/>");
      profileimg.append(img);
      $("#article-card-left").append(profileimg);

      if (!nd._setProfileImageUrlPerson(article,img))
        nd._setTwitterProfileImageUrl(article,img);

      if (article["about"]["name"])
        $("#article-card-left").append('<h2 id="article-card-name">'+article["about"]["name"]+'</h2>');

      if (article["about"]["memberOf"]){
        var organizations = $("<div/>").addClass("linked-tag");
        var organizationsUl = $("<ul/>");
        organizations.append(organizationsUl);
        for (key in article["about"]["memberOf"]){
          var organizationItem = $('<li/>');
          var organizationLink = $('<a href="#">'+article["about"]["memberOf"][key]["name"]+'</a>');
          organizationLink.on("click",function(event){
            nd._clearSearch();
            nd.filterSearch($(this).text());
            $('#article-card').modal('hide');
          });
          organizationItem.append(organizationLink);
          organizationsUl.append(organizationItem);
        }
        $("#article-card-left").append(organizations);
      }

      if (article["about"]["address"])
        $("#article-card-left").append('<p id="article-card-location">'+article["about"]["address"]["addressLocality"]+", "+article["about"]["address"]["addressCountry"]+'</p>');

      // EMAIL
      var email = nd._getValueForKey(article["about"]["sameAs"],"Email");
      if (email){
       $("#article-card-left").append($("<div/>").addClass("email contact-point").html('<a href="' + "mailto:" + email + '"><i class="fa fa-envelope fa-lg"></i></a>'));
      }

      // WEBSITE
      if (article["about"]["url"]){
        $("#article-card-left").append($("<div/>").addClass("website contact-point").html('<a href="' + article["about"]["url"] + '" target="_blank"><i class="fa fa-globe fa-lg"></i></a>'));
      }

      // TWITTER
      var twitter = nd._getValueForKey(article["about"]["sameAs"],"Twitter");
      if (twitter){
        $("#article-card-left").append($("<div/>").addClass("twitter contact-point").html('<a href="https://www.twitter.com/' + nd._cleanTwitterHandle(twitter) + '" target="_blank"><i class="fa fa-twitter fa-lg"></i></a>'));
      }

      // FACEBOOK
      var facebook = nd._getValueForKey(article["about"]["sameAs"],"Facebook");
      if (facebook){
        $("#article-card-left").append($("<div/>").addClass("facebook contact-point").html('<a href="' + facebook + '" target="_blank"><i class="fa fa-facebook fa-lg"></i></a>'));
      }

      // LINKEDIN
      var linkedin = nd._getValueForKey(article["about"]["sameAs"],"LinkedIn");
      if (linkedin){
        $("#article-card-left").append($("<div/>").addClass("linkedin contact-point").html('<a href="' + linkedin + '" target="_blank"><i class="fa fa-linkedin fa-lg"></i></a>'));
      }

      // GITHUB
      var github = nd._getValueForKey(article["about"]["sameAs"],"Github");
      if (github){
        $("#article-card-left").append($("<div/>").addClass("github contact-point").html('<a href="' + github + '" target="_blank"><i class="fa fa-github fa-lg"></i></a>'));
      }

      // Description
      $("#article-card-right").append("<h2>About "+article["about"]["name"]+"</h2>");
      $("#article-card-right").append('<p id="article-card-description">'+article["about"]["description"]+'</p>');

      // Interests
      $("#article-card-right").append("<h2>Areas of interest</h2>");
      if (article["about"]["interest"]){
        var skills = $("<div/>").addClass("linked-tag");
        var skillsUl = $("<ul/>");
        skills.append(skillsUl);
        for (key in article["about"]["interest"]){
          var listItem = $('<li/>');
          var skillLink = $('<a href="#">'+article["about"]["interest"][key]["name"]+'</a>');
          skillLink.on("click",function(event){
            nd._clearSearch();
            nd.filterSearch($(this).text());
            $('#article-card').modal('hide');
          });
          listItem.append(skillLink);
          skillsUl.append(listItem);
        }
        $("#article-card-right").append(skills);
      }

      $("#profile-published-uri").html("<p>PLP Profile stored under: <b></br><a href=\""+article["about"]["id"]+"\">"+article["about"]["id"]+"</a></b></p>");
    }

    // Generates the HTML content of the card representation of the articles on the grid
    this._renderArticleCardDetailsOrganization = function(article){

      $("#article-card-left").empty();
      $("#article-card-right").empty();

      var profileimg = $("<div/>").addClass("profileimage");
      var img = $("<img/>");
      profileimg.append(img);
      $("#article-card-left").append(profileimg);

      if (!nd._setProfileImageUrlOrganization(article,img))
        nd._setTwitterProfileImageUrl(article,img);

      if (article["about"]["name"])
        $("#article-card-left").append('<h2 id="article-card-name">'+article["about"]["name"]+'</h2>');

      if (article["about"]["address"])
        $("#article-card-left").append('<p id="article-card-location">'+article["about"]["address"]["addressLocality"]+", "+article["about"]["address"]["addressCountry"]+'</p>');

      // EMAILf
      var email = nd._getValueForKey(article["about"]["sameAs"],"Email");
      if (email){
       $("#article-card-left").append($("<div/>").addClass("email contact-point").html('<a href="' + "mailto:" + email + '"><i class="fa fa-envelope fa-lg"></i></a>'));
      }

      // WEBSITE
      if (article["about"]["url"]){
        $("#article-card-left").append($("<div/>").addClass("website contact-point").html('<a href="' + article["about"]["url"] + '" target="_blank"><i class="fa fa-globe fa-lg"></i></a>'));
      }

      // TWITTER
      var twitter = nd._getValueForKey(article["about"]["sameAs"],"Twitter");
      if (twitter){
        $("#article-card-left").append($("<div/>").addClass("twitter contact-point").html('<a href="https://www.twitter.com/' + nd._cleanTwitterHandle(twitter) + '" target="_blank"><i class="fa fa-twitter fa-lg"></i></a>'));
      }

      // FACEBOOK
      var facebook = nd._getValueForKey(article["about"]["sameAs"],"Facebook");
      if (facebook){
        $("#article-card-left").append($("<div/>").addClass("facebook contact-point").html('<a href="' + facebook + '" target="_blank"><i class="fa fa-facebook fa-lg"></i></a>'));
      }

      // LINKEDIN
      var linkedin = nd._getValueForKey(article["about"]["sameAs"],"LinkedIn");
      if (linkedin){
        $("#article-card-left").append($("<div/>").addClass("linkedin contact-point").html('<a href="' + linkedin + '" target="_blank"><i class="fa fa-linkedin fa-lg"></i></a>'));
      }

      // GITHUB
      var github = nd._getValueForKey(article["about"]["sameAs"],"Github");
      if (github){
        $("#article-card-left").append($("<div/>").addClass("github contact-point").html('<a href="' + github + '" target="_blank"><i class="fa fa-github fa-lg"></i></a>'));
      }

      // Description
      $("#article-card-right").append("<h2>About "+article["about"]["name"]+"</h2>");
      $("#article-card-right").append('<p id="article-card-description">'+article["about"]["description"]+'</p>');

      // Interests
      $("#article-card-right").append("<h2>Areas of interest</h2>");
      if (article["about"]["interest"]){
        var skills = $("<div/>").addClass("linked-tag");
        var skillsUI = $("<ul/>");
        skills.append(skillsUI);
        for (key in article["about"]["interest"]){
          var listItem = $('<li/>');
          var skillLink = $('<a href="#">'+article["about"]["interest"][key]["name"]+'</a>');
          skillLink.on("click",function(event){
            nd._clearSearch();
            nd.filterSearch($(this).text());
            $('#article-card').modal('hide');
          });
          listItem.append(skillLink);
          skillsUI.append(listItem);
        }
        $("#article-card-right").append(skills);

      }

      // Members
      $("#article-card-right").append("<h2>Members</h2>");
      if (article["about"]["member"]){
        var members = $("<div/>").addClass("linked-tag");
        var membersUI = $("<ul/>");
        members.append(membersUI);
        for (key in article["about"]["member"]){
          var listItem = $('<li/>');
          var memberLink = $('<a href="#">'+article["about"]["member"][key]["name"]+'</a>');
          memberLink.on("click",function(event){
            nd._clearSearch();
            nd.filterSearch($(this).text());
            $('#article-card').modal('hide');
          });
          listItem.append(memberLink);
          membersUI.append(listItem);
        }
        $("#article-card-right").append(members);

      }

      $("#profile-published-uri").html("<p>PLP Profile stored under: <b></br><a href=\""+article["about"]["id"]+"\">"+article["about"]["id"]+"</a></b></p>");
    }

    // Generates the HTML content of the card representation of the articles on the grid
    this._renderArticleCardDetailsPlace = function(article){

      $("#article-card-left").empty();
      $("#article-card-right").empty();

      var profileimg = $("<div/>").addClass("profileimage");
      var img = $("<img/>");
      profileimg.append(img);
      $("#article-card-left").append(profileimg);

      if (!nd._setProfileImageUrlPlace(article,img))
        nd._setTwitterProfileImageUrl(article,img);

      if (article["about"]["name"])
        $("#article-card-left").append('<h2 id="article-card-name">'+article["about"]["name"]+'</h2>');

      if (article["about"]["address"])
        $("#article-card-left").append('<p id="article-card-location">'+article["about"]["address"]["addressLocality"]+", "+article["about"]["address"]["addressCountry"]+'</p>');

      // Description
      $("#article-card-right").append("<h2>About "+article["about"]["name"]+"</h2>");
      $("#article-card-right").append('<p id="article-card-description">'+article["about"]["description"]+'</p>');

      $("#profile-published-uri").html("<p>PLP Profile stored under: <b></br><a href=\""+article["about"]["id"]+"\">"+article["about"]["id"]+"</a></b></p>");
    }

    this._isActiveFilter = function(d,e){
        var i = nd.activeFilters[d].indexOf(e);
        return i > -1;
    };

    this._findArticleById = function(id){
        return articles[id];
    };

    this._buildSearchFilterArray = function(){

      var articleSearchFilter = new Object;
      articleSearchFilter.articleTitles = [];

      // Skills
      var aa_tags = nd._aaReduce(nd.cf.aar_dimension.groupAll().reduce(reduceAdd, reduceRemove, reduceInitial).value());
      $.each(aa_tags, function( index, value ) {
        articleSearchFilter[value["key"]] = new Object;
        articleSearchFilter[value["key"]].filter = "aa";
        articleSearchFilter[value["key"]].id = value["key"];
        articleSearchFilter.articleTitles.push(value["key"]);
      });

      // Country
      var dd_tags = nd._removeEmptyKeys(nd.cf.dd_dimension.group().all(), "dd");
      $.each(dd_tags, function( index, value ) {
        articleSearchFilter[value["key"]] = new Object;
        articleSearchFilter[value["key"]].filter = "dd";
        articleSearchFilter[value["key"]].id = value["key"];
        articleSearchFilter.articleTitles.push(value["key"]);
      });

      // City
      var ee_tags = nd._removeEmptyKeys(nd.cf.ee_dimension.group().all(), "ee");
      $.each(ee_tags, function( index, value ) {
        articleSearchFilter[value["key"]] = new Object;
        articleSearchFilter[value["key"]].filter = "ee";
        articleSearchFilter[value["key"]].id = value["key"];
        articleSearchFilter.articleTitles.push(value["key"]);
      });

      // organisation
      var ff_tags = nd._removeEmptyKeys(nd.cf.ff_dimension.group().all(), "ff");
      $.each(ff_tags, function( index, value ) {
        articleSearchFilter[value["key"]] = new Object;
        articleSearchFilter[value["key"]].filter = "ff";
        articleSearchFilter[value["key"]].id = value["key"];
        articleSearchFilter.articleTitles.push(value["key"]);
      });

      // add to search filter
      $.each(id_tags, function( index, value ) {
        var a = nd._findArticleById(value["key"]);
        var name = a["about"]["name"];
        articleSearchFilter[name] = new Object;
        articleSearchFilter[name].filter = "id";
        articleSearchFilter[name].id = name;
        articleSearchFilter.articleTitles.push(name);
      });

      return articleSearchFilter;

    };

    // This function does two things:
    //  1. Removes keys if their values are 0
    //  2. Removes all the keys but one if a filter is selected on ff, dd or id
    this._removeEmptyKeys = function(d, dim){
        if(dim === "aa"){
            var a = [];
            for(var i in d){
              if(d[i].value !== 0 && d[i].key!="N/A") a.push(d[i]);
            }
            return a;
        }

        var f = nd.activeFilters[dim];
        if(f.length === 0){
            var a = [];
            for(var i in d){
              if(d[i].value !== 0 && d[i].key!="N/A") a.push(d[i]);
            }
            return a;
        }else{
            var a = [];
            for(var i  in d){
              if(f.indexOf(d[i].key) > -1) a.push(d[i]);
            }
            return a;
        }
    };


    // The value we get for ... is in a different
    // format. This function makes it the same
    this._aaReduce = function(d){
        var a = [];
        for(var i in d) a.push({"key": i, "value": d[i]});
        return a;
    };

    this._setProfileImageUrlPerson = function(article,profile_image_holder){

      var pathToImage = "res/img/Person.png"
      var img = $("<img class=\"card-photo\" src=\""+pathToImage+"\"></img>");
      img.attr("data-article-id",article["about"]["name"]);
      profile_image_holder.append(img);

      if (article["about"]["image"]){

        pathToImage = article["about"]["image"];
        img.attr("src",pathToImage);
        return true;
      }

      return false;

    }

    this._setProfileImageUrlOrganization = function(article,profile_image_holder){

      pathToImage = "res/img/Organization.png"
      profile_image_holder.html("<img src=\""+pathToImage+"\"></img>")

      if (article["about"]["logo"]){

        pathToImage = article["about"]["logo"];
        profile_image_holder.html("<img src=\""+pathToImage+"\"></img>")
        return true;
      }

      return false;

    }

    this._setProfileImageUrlPlace = function(article,profile_image_holder){

      pathToImage = "res/img/Place.png"
      profile_image_holder.html("<img src=\""+pathToImage+"\"></img>")

      if (article["about"]["image"]){

        pathToImage = article["about"]["image"];
        profile_image_holder.html("<img src=\""+pathToImage+"\"></img>")
        return true;
      }

      return false;

    }

    this._setTwitterProfileImageUrl = function(article,img){

      var twitter = nd._getValueForKey(article["about"]["sameAs"],"Twitter");
      if (!twitter) return;

      var twitterHandle = nd._getValueForKey(article["about"]["sameAs"],"Twitter")
      twitterHandle = nd._cleanTwitterHandle(twitterHandle);

      var imageGetterUrl = window.plp.config.twitterImageGetterUrl+"?screen_name="+twitterHandle;
      superagent.get(imageGetterUrl)
      .set('Accept', 'text/plain')
      .end(function(err,res){

        if (err){
          console.log(err);
        }else if(res.status != 400){
          img.attr("src",res.text);
        }

      });

    };

    this._cleanTwitterHandle= function(twitterHandle){

      twitterHandle = twitterHandle.replace( "@", "" );
      twitterHandle = twitterHandle.replace( "http://www.twitter.com/", "" );
      twitterHandle = twitterHandle.replace( "https://www.twitter.com/", "" );
      twitterHandle = twitterHandle.replace( "https://twitter.com/", "" );
      twitterHandle = twitterHandle.replace( "http://twitter.com/", "" );
      twitterHandle = twitterHandle.replace( "twitter.com/", "" );

      return twitterHandle;

    }

    this._getFacebookProfileUrl = function(username){

      console.log('_getFacebookProfileUrl');

    };

    this._getValueForKey = function(element,value){
      for (key in element){
        if (element[key]["name"].toLowerCase().indexOf(value.toLowerCase()) > -1)
          return element[key]["url"];
      }
    }

};


/*------------------------------
Reduce functions for the arrays
of AA.
------------------------------*/

function getParameterByName(name) {
  var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

function reduceAdd(p, v) {
  if (!v["about"]["interest"]) return p;
  v["about"]["interest"].forEach (function(val, idx) {
     p[val["name"]] = (p[val["name"]] || 0) + 1; //increment counts
  });
  return p;
}

function reduceRemove(p, v) {
  if (!v["about"]["interest"]) return p;
  v["about"]["interest"].forEach (function(val, idx) {
     p[val["name"]] = (p[val["name"]] || 0) - 1; //decrement counts
  });
  return p;
}

function reduceInitial() {
  return {};
}
