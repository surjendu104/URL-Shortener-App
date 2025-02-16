import express from "express";
import { nanoid } from "nanoid";
import isValidUrl from "../utils.js";
import UrlModel2 from "../models/UrlModel2.js";
import { isApiAuthenticated } from "./apiAuth.js";
import ExcelJS from "exceljs";
import { SHORT_URL_PREFIX } from "../Constants.js";

const router = express.Router();

//  * redirect to original url. route: ip/api/v2/url/:code
router.get("/url/:short", async (req, res) => {
  const shortUrl = req.params.short;

  try {
    const url = await UrlModel2.findOne({
      "urlArray.shortUrl": shortUrl,
    }).select({ "urlArray.$": 1 });

    // check if url is present in db
    if (!url) {
      res.status(404).json({ error: "Url not found" });
      return;
    }
    // count the URL visit
    const visitCount = url.urlArray[0].visitCount || 0;
    await countUrlVisit(shortUrl, visitCount);

    // http status for redirect: 302
    res.status(302).redirect(url.urlArray[0].originalUrl);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

//  * get all generated urls by current user. route: ip/api/v2/history
router.get("/history", isApiAuthenticated, async (req, res) => {
  try {
    const urlObj = await UrlModel2.findOne({ userId: req.user._id });
    if (urlObj) {
      res.status(200).json({ urlArray: urlObj.urlArray });
    } else {
      res.status(200).json({ urlArray: [] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

//  * generate short url. route: ip/api/v2/url
router.post("/url", isApiAuthenticated, async (req, res) => {
  const url = req.body.url;

  if (!isValidUrl(url)) {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  const id = nanoid(10);
  // get user id from token
  const userId = req.user._id;
  // isUserRegistered ? append the url object to existing array of that user : create new collection for 1 time only
  try {
    const urlObj = await UrlModel2.findOne({ userId: userId });
    if (urlObj) {
      urlObj.urlArray.push({
        shortUrl: id,
        originalUrl: url,
        visitCount: 0,
      });
      await urlObj.save();
    } else {
      const myModel = new UrlModel2();
      myModel.userId = userId;
      myModel.urlArray.push({
        shortUrl: id,
        originalUrl: url,
        visitCount: 0,
      });
      await myModel.save();
    }
    // send response
    res
      .status(200)
      .json({ shortUrl: `https://app.dhananjaythomble.me/api/v2/url/${id}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

//  * delete a url. route: ip/api/v2/url/:id
router.delete("/delete/:id", isApiAuthenticated, async (req, res) => {
  const id = req.params.id;
  // console.log("url id: ", id, "user id: ", req.user._id);
  try {
    const urlObj = await UrlModel2.findOne({
      userId: req.user._id,
      urlArray: { $elemMatch: { shortUrl: id } },
    });
    if (urlObj) {
      urlObj.urlArray = urlObj.urlArray.filter((url) => url.shortUrl !== id);
      const status = await urlObj.save();
      if (status) {
        res.status(200).json({ ok: true });
      } else {
        res.status(500).json({ error: "Server error" });
      }
    } else {
      res.status(404).json({ error: "Url not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// export url data to excel file
router.get("/export", isApiAuthenticated, async (req, res) => {
  //
  try {
    const urlObj = await UrlModel2.findOne({ userId: req.user._id });
    if (urlObj) {
      // data found
      // console.log(urlObj.urlArray);
      //    create new workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "DT URL Shortener";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Generated_URLs");

      // Add the headers to the worksheet
      worksheet.columns = [
        { header: "Short URL", key: "shortUrl", width: 50 },
        { header: "Original URL", key: "originalUrl", width: 50 },
        { header: "Visits", key: "visits", width: 10 },
      ];
      // make header bold
      worksheet.getRow(1).font = { bold: true };

      // add data to sheet
      urlObj.urlArray.forEach((url) => {
        worksheet.addRow({
          shortUrl: SHORT_URL_PREFIX + url.shortUrl,
          originalUrl: url.originalUrl,
          visits: url.visitCount,
        });
      });

      // Set the response headers
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      // Send the Excel file to the client
      const buffer = await workbook.xlsx.writeBuffer();
      // set file name
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=Generated_URLs.xlsx"
      );
      res.status(200).send(buffer);
    } else {
      //    data not found
      res.status(404).json({ error: "No Generated URL found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

async function countUrlVisit(urlID, visitCount) {
  // increment the visit count
  try {
    //    find the url object containing the urlID and increment the visit count
    const urlObj = await UrlModel2.findOneAndUpdate(
      { "urlArray.shortUrl": urlID },
      { $set: { "urlArray.$.visitCount": visitCount + 1 } }
    );
    if (!urlObj) {
      console.error("url not found");
    }
  } catch (error) {
    console.error(error);
  }
}

export default router;
