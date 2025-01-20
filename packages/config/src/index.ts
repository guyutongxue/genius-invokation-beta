// Copyright (C) 2024-2025 Guyutongxue
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

/** Toggle this when editing beta version. */
export const IS_BETA = true;

export const BETA_VERSION = "v9999.0.0-beta";

export const DEFAULT_ASSET_API_ENDPOINT = IS_BETA
  ? `https://beta.assets.gi-tcg.guyutongxue.site/api/v2`
  : `https://assets.gi-tcg.guyutongxue.site/api/v2`;

export const WEB_CLIENT_BASE_PATH = import.meta.env.WEB_CLIENT_BASE_PATH || "/";
export const SERVER_HOST = import.meta.env.DEV
  ? "http://localhost:3000"
  : import.meta.env.SERVER_HOST
  ? `https://${import.meta.env.SERVER_HOST}`
  : "";
