/**
 * Display buckets from pinned public BF16 checkpoints; no model execution is needed.
 * Each vector uses the notebook's downsample_1d reduction: round a linear sequence
 * of 21 boundaries across the 2,048 dimensions, then average within each bucket.
 * These parameter means are for display/reconstruction only. In particular, the
 * recorded normalized output must not be recomputed from means of x and gamma:
 * bucket means do not preserve second moments or their elementwise covariance.
 */
export interface FinalNormCheckpoint {
  modelId: string;
  revision: string;
  source: string;
  hiddenSize: number;
  bucketCount: number;
  selectedGateNormalization: 'none' | 'sum';
  normWeight: { parameter: string; dtype: string; values: number[] };
  outputBias?: { parameter: string; dtype: string; values: number[] };
}

export const FINAL_NORM_CHECKPOINTS: readonly FinalNormCheckpoint[] = [
  {
    "modelId": "allenai/OLMoE-1B-7B-0924",
    "revision": "6d84c48581ece794365f2b8e9cfb043c68ade9c5",
    "source": "https://huggingface.co/allenai/OLMoE-1B-7B-0924/tree/6d84c48581ece794365f2b8e9cfb043c68ade9c5",
    "hiddenSize": 2048,
    "bucketCount": 20,
    "selectedGateNormalization": "none",
    "normWeight": {
      "parameter": "model.norm.weight",
      "dtype": "BF16",
      "values": [
        2.1924019607843137,
        2.1692961165048543,
        2.155560661764706,
        2.1596253033980584,
        2.174172794117647,
        2.1509650735294117,
        2.148513349514563,
        2.216605392156863,
        2.184541868932039,
        2.1675091911764706,
        2.196767769607843,
        2.173998786407767,
        2.19140625,
        2.1875,
        2.1669730392156863,
        2.1785386029411766,
        2.2013804611650487,
        2.2073376225490198,
        2.1999393203883497,
        2.1815257352941178
      ]
    }
  },
  {
    "modelId": "jetmoe/jetmoe-8b",
    "revision": "d8fd02ccf7911aa8148a63c7984ffd2e465b0352",
    "source": "https://huggingface.co/jetmoe/jetmoe-8b/tree/d8fd02ccf7911aa8148a63c7984ffd2e465b0352",
    "hiddenSize": 2048,
    "bucketCount": 20,
    "selectedGateNormalization": "sum",
    "normWeight": {
      "parameter": "model.norm.weight",
      "dtype": "BF16",
      "values": [
        1.8692555147058822,
        1.8555825242718447,
        1.8595281862745099,
        1.8456462378640777,
        1.8326775045955883,
        1.8424431295955883,
        1.8400333737864079,
        1.8546262254901962,
        1.8239959420509708,
        1.9077052696078431,
        1.862094056372549,
        1.8448877427184467,
        1.8526348039215685,
        1.8703731796116505,
        1.8403033088235294,
        1.9128370098039216,
        1.8848604368932038,
        1.9106158088235294,
        1.8265321601941749,
        1.8586856617647058
      ]
    },
    "outputBias": {
      "parameter": "model.layers.23.mlp.bias",
      "dtype": "BF16",
      "values": [
        -0.017424115947648592,
        -0.014306966540882888,
        0.014795939127604166,
        -0.0017744082849002578,
        -0.026148253796147367,
        -0.023374071308210783,
        -0.008233375919675365,
        0.007439781637752757,
        0.018809198175819174,
        -0.010321448830997242,
        -0.016997094247855393,
        0.007028968588819781,
        -0.004163704666436887,
        -0.01220769789612409,
        0.004222364986644071,
        -0.0011859968596813725,
        0.008276893097220116,
        -0.004394680845971201,
        -0.0021387396506892826,
        0.011682697370940564
      ]
    }
  },
  {
    "modelId": "deepseek-ai/deepseek-moe-16b-base",
    "revision": "521d2bc4fb69a3f3ae565310fcc3b65f97af2580",
    "source": "https://huggingface.co/deepseek-ai/deepseek-moe-16b-base/tree/521d2bc4fb69a3f3ae565310fcc3b65f97af2580",
    "hiddenSize": 2048,
    "bucketCount": 20,
    "selectedGateNormalization": "none",
    "normWeight": {
      "parameter": "model.norm.weight",
      "dtype": "BF16",
      "values": [
        1.9602481617647058,
        1.912697208737864,
        1.9283854166666667,
        1.9280188106796117,
        1.966452205882353,
        1.9350490196078431,
        1.8933555825242718,
        1.9055606617647058,
        1.9255916262135921,
        1.989889705882353,
        1.935891544117647,
        1.9366656553398058,
        1.928079044117647,
        1.9214199029126213,
        1.9518995098039216,
        1.9594822303921569,
        1.9060224514563107,
        1.9658394607843137,
        1.9826304611650485,
        1.9587162990196079
      ]
    }
  }
];
